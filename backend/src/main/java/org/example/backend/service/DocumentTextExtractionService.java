package org.example.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import org.apache.poi.xwpf.usermodel.IBodyElement;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFPictureData;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableCell;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class DocumentTextExtractionService {

    private static final Logger logger = LoggerFactory.getLogger(DocumentTextExtractionService.class);
    private static final Pattern ALNUM_PATTERN = Pattern.compile("[A-Za-z0-9]");
    private static final Pattern PAGE_MARKER_PATTERN = Pattern.compile("(?m)^\\s*\\[Page\\s+(\\d+)\\]\\s*$");

    private final ObjectMapper objectMapper;

    @Value("${toeic.storage-dir:./data}")
    private String storageDir;

    @Value("${toeic.python-bin:python}")
    private String pythonBin;

    @Value("${openai.api-key:}")
    private String openAiApiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String openAiModel;

    @Value("${openai.base-url:https://api.openai.com/v1/chat/completions}")
    private String openAiBaseUrl;

    public record ExtractedPage(
            int pageNumber,
            String text,
            boolean ocrApplied,
            double ocrConfidence,
            String engine,
            List<String> tables
    ) {}

    public record DocumentExtractionResult(
            String detectedFormat,
            int pageCount,
            boolean ocrUsed,
            String ocrEngine,
            String fullAnnotatedText,
            List<ExtractedPage> pages
    ) {}

    public String computeSha256Hex(byte[] bytes) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(bytes));
        } catch (Exception ex) {
            return String.valueOf(bytes.length);
        }
    }

    public String storeUploadedDocument(Long userId, String sha256, String originalFilename, byte[] bytes) {
        try {
            String safeName = sanitizeFilename(originalFilename);
            Path dir = Paths.get(storageDir, "documents", String.valueOf(userId)).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            Path target = dir.resolve(sha256.substring(0, Math.min(12, sha256.length())) + "_" + safeName);
            Files.write(target, bytes);
            return target.toString();
        } catch (IOException ex) {
            logger.warn("Could not store uploaded document locally: {}", ex.getMessage());
            return "";
        }
    }

    public DocumentExtractionResult extract(String fileName, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new AppException(ErrorCode.INVALID_FILE);
        }
        String ext = getExtension(fileName);
        if (ext.isEmpty()) {
            ext = detectExtensionByMagicBytes(bytes);
        }
        return switch (ext) {
            case "pdf" -> extractPdf(bytes);
            case "docx" -> extractDocx(bytes);
            case "doc" -> extractDoc(bytes);
            case "txt" -> extractTxt(bytes);
            case "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff" -> extractImage(bytes, ext);
            default -> {
                String sniffed = detectExtensionByMagicBytes(bytes);
                if (!sniffed.isEmpty() && !sniffed.equals(ext)) {
                    yield extract("document." + sniffed, bytes);
                }
                throw new AppException(ErrorCode.UNSUPPORTED_DOCUMENT_FORMAT);
            }
        };
    }

    private String detectExtensionByMagicBytes(byte[] bytes) {
        if (bytes.length >= 4 && bytes[0] == '%' && bytes[1] == 'P' && bytes[2] == 'D' && bytes[3] == 'F') {
            return "pdf";
        }
        if (bytes.length >= 4 && bytes[0] == (byte) 0x89 && bytes[1] == 'P' && bytes[2] == 'N' && bytes[3] == 'G') {
            return "png";
        }
        if (bytes.length >= 3 && bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xD8 && bytes[2] == (byte) 0xFF) {
            return "jpg";
        }
        if (bytes.length >= 12 && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return "webp";
        }
        if (bytes.length >= 2 && bytes[0] == 'B' && bytes[1] == 'M') {
            return "bmp";
        }
        if (bytes.length >= 8 && bytes[0] == (byte) 0xD0 && bytes[1] == (byte) 0xCF
                && bytes[2] == 0x11 && bytes[3] == (byte) 0xE0) {
            return "doc";
        }
        if (bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 0x03 && bytes[3] == 0x04) {
            return "docx";
        }
        return "";
    }

    private DocumentExtractionResult extractTxt(byte[] bytes) {
        String content = decodeTextBytes(bytes);
        List<ExtractedPage> pages = new ArrayList<>();
        String[] formFeedPages = content.split("\f");
        if (formFeedPages.length > 1) {
            for (int i = 0; i < formFeedPages.length; i++) {
                String pText = formFeedPages[i].trim();
                if (!pText.isEmpty()) {
                    pages.add(new ExtractedPage(i + 1, pText, false, 1.0, "TXT_UTF8", List.of()));
                }
            }
        } else {
            Matcher m = PAGE_MARKER_PATTERN.matcher(content);
            if (m.find()) {
                pages.addAll(splitByExplicitPageMarkers(content));
            } else {
                pages.add(new ExtractedPage(1, content.trim(), false, 1.0, "TXT_UTF8", List.of()));
            }
        }
        if (pages.isEmpty()) {
            pages.add(new ExtractedPage(1, content.trim(), false, 1.0, "TXT_UTF8", List.of()));
        }
        return buildSummary("TXT", pages, false, "NONE");
    }

    private DocumentExtractionResult extractDocx(byte[] bytes) {
        try (XWPFDocument doc = new XWPFDocument(new ByteArrayInputStream(bytes))) {
            List<ExtractedPage> pages = new ArrayList<>();
            StringBuilder pageBuf = new StringBuilder();
            List<String> currentTables = new ArrayList<>();
            int pageNo = 1;

            for (IBodyElement elem : doc.getBodyElements()) {
                if (elem instanceof XWPFParagraph para) {
                    boolean hasPageBreak = false;
                    if (para.isPageBreak()) {
                        hasPageBreak = true;
                    } else if (para.getCTP() != null && para.getCTP().toString().contains("w:br")) {
                        String xml = para.getCTP().toString();
                        if (xml.contains("type=\"page\"") || xml.contains("lastRenderedPageBreak")) {
                            hasPageBreak = true;
                        }
                    }

                    if (hasPageBreak && !pageBuf.isEmpty()) {
                        pages.add(new ExtractedPage(pageNo++, pageBuf.toString().trim(), false, 1.0, "POI_DOCX", List.copyOf(currentTables)));
                        pageBuf.setLength(0);
                        currentTables.clear();
                    }

                    String text = para.getText();
                    if (text != null && !text.trim().isEmpty()) {
                        pageBuf.append(text.trim()).append("\n");
                    }
                } else if (elem instanceof XWPFTable table) {
                    String formattedTable = formatXwpfTable(table);
                    if (!formattedTable.isEmpty()) {
                        currentTables.add(formattedTable);
                        pageBuf.append("\n[TABLE]\n").append(formattedTable).append("[/TABLE]\n");
                    }
                }
            }

            if (!pageBuf.isEmpty()) {
                pages.add(new ExtractedPage(pageNo, pageBuf.toString().trim(), false, 1.0, "POI_DOCX", List.copyOf(currentTables)));
            }
            if (pages.isEmpty() && doc.getAllPictures() != null && !doc.getAllPictures().isEmpty()) {
                int imgPage = 1;
                boolean anyOcr = false;
                String ocrEng = "NONE";
                for (XWPFPictureData pic : doc.getAllPictures()) {
                    byte[] imgBytes = pic.getData();
                    if (imgBytes == null || imgBytes.length == 0) {
                        continue;
                    }
                    BufferedImage buffered = ImageIO.read(new ByteArrayInputStream(imgBytes));
                    if (buffered != null) {
                        OcrOutput ocrOut = runOcrOnBufferedImage(buffered);
                        if (!ocrOut.text().isBlank()) {
                            anyOcr = true;
                            ocrEng = ocrOut.engine();
                            pages.add(new ExtractedPage(imgPage++, ocrOut.text(), true, ocrOut.confidence(), ocrOut.engine(), List.of()));
                        }
                    }
                }
                if (!pages.isEmpty()) {
                    return buildSummary("DOCX", pages, anyOcr, ocrEng);
                }
            }
            if (pages.isEmpty()) {
                throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
            }
            return buildSummary("DOCX", pages, false, "NONE");
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            logger.error("DOCX extraction error: {}", ex.getMessage());
            throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
        }
    }

    private DocumentExtractionResult extractDoc(byte[] bytes) {
        if (bytes.length >= 4 && bytes[0] == 'P' && bytes[1] == 'K' && bytes[2] == 0x03 && bytes[3] == 0x04) {
            return extractDocx(bytes);
        }
        try (HWPFDocument doc = new HWPFDocument(new ByteArrayInputStream(bytes));
             WordExtractor extractor = new WordExtractor(doc)) {
            String fullText = extractor.getText();
            if (fullText == null || fullText.trim().isEmpty()) {
                throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
            }
            List<ExtractedPage> pages = new ArrayList<>();
            String[] sections = fullText.split("\f");
            for (int i = 0; i < sections.length; i++) {
                String text = sections[i].trim();
                if (!text.isEmpty()) {
                    pages.add(new ExtractedPage(i + 1, text, false, 1.0, "POI_DOC", List.of()));
                }
            }
            if (pages.isEmpty()) {
                pages.add(new ExtractedPage(1, fullText.trim(), false, 1.0, "POI_DOC", List.of()));
            }
            return buildSummary("DOC", pages, false, "NONE");
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            String preview = decodeTextBytes(bytes).trim();
            if (preview.startsWith("{\\rtf")) {
                try {
                    byte[] rtfNormalizedBytes = preview
                            .replaceAll("\\\\line(?![a-zA-Z])", "\\\\par ")
                            .getBytes(StandardCharsets.ISO_8859_1);
                    javax.swing.text.rtf.RTFEditorKit kit = new javax.swing.text.rtf.RTFEditorKit();
                    javax.swing.text.Document rtfDoc = kit.createDefaultDocument();
                    kit.read(new ByteArrayInputStream(rtfNormalizedBytes), rtfDoc, 0);
                    String rtfText = normalizeExtractedPageText(rtfDoc.getText(0, rtfDoc.getLength()));
                    if (countMeaningfulAlnum(rtfText) >= 15) {
                        return buildSummary("DOC", List.of(new ExtractedPage(1, rtfText, false, 0.92, "DOC_RTF_FALLBACK", List.of())), false, "NONE");
                    }
                } catch (Exception rtfEx) {
                    logger.debug("RTF fallback failed: {}", rtfEx.getMessage());
                }
            } else if (preview.startsWith("<html") || preview.startsWith("<!DOCTYPE") || preview.startsWith("<?xml")) {
                String stripped = preview
                        .replaceAll("(?s)<style.*?</style>", " ")
                        .replaceAll("(?s)<script.*?</script>", " ")
                        .replaceAll("<[^>]+>", "\n")
                        .replaceAll("&nbsp;", " ")
                        .replaceAll("&amp;", "&")
                        .replaceAll("&lt;", "<")
                        .replaceAll("&gt;", ">")
                        .replaceAll("[ \\t]+", " ")
                        .replaceAll("\n{3,}", "\n\n")
                        .trim();
                if (countMeaningfulAlnum(stripped) >= 15) {
                    return buildSummary("DOC", List.of(new ExtractedPage(1, stripped, false, 0.9, "DOC_HTML_FALLBACK", List.of())), false, "NONE");
                }
            }
            logger.error("DOC extraction error: {}", ex.getMessage());
            throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
        }
    }

    private DocumentExtractionResult extractPdf(byte[] bytes) {
        try (PDDocument document = Loader.loadPDF(bytes)) {
            int totalPages = document.getNumberOfPages();
            if (totalPages <= 0) {
                throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
            }

            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setSortByPosition(true);
            stripper.setParagraphStart("\n");
            stripper.setWordSeparator(" ");

            PDFRenderer renderer = new PDFRenderer(document);
            List<ExtractedPage> pages = new ArrayList<>();
            boolean anyOcr = false;
            String lastOcrEngine = "NONE";

            for (int pageIdx = 0; pageIdx < totalPages; pageIdx++) {
                int pageNum = pageIdx + 1;
                stripper.setStartPage(pageNum);
                stripper.setEndPage(pageNum);
                String rawText = stripper.getText(document);
                String cleaned = normalizeExtractedPageText(rawText);

                if (countMeaningfulAlnum(cleaned) >= 40) {
                    pages.add(new ExtractedPage(pageNum, cleaned, false, 1.0, "PDFBOX_TEXT", List.of()));
                } else {
                    // Scanned or image-only PDF page -> render to high-DPI PNG & run real OCR
                    BufferedImage pageImg = renderer.renderImageWithDPI(pageIdx, 220f, ImageType.RGB);
                    OcrOutput ocrOut = runOcrOnBufferedImage(pageImg);
                    anyOcr = true;
                    lastOcrEngine = ocrOut.engine();
                    String ocrText = !ocrOut.text().isEmpty() ? ocrOut.text() : cleaned;
                    pages.add(new ExtractedPage(pageNum, ocrText, true, ocrOut.confidence(), ocrOut.engine(), List.of()));
                }
            }

            String fmt = anyOcr ? "SCANNED_PDF" : "PDF";
            return buildSummary(fmt, pages, anyOcr, lastOcrEngine);
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            logger.error("PDF extraction error: {}", ex.getMessage());
            throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
        }
    }

    private DocumentExtractionResult extractImage(byte[] bytes, String ext) {
        try {
            Path tempImg = Files.createTempFile("toeic_img_", "." + ext);
            try {
                Files.write(tempImg, bytes);
                OcrOutput ocrOut = runOcrOnImageFile(tempImg);
                if (ocrOut.text().isBlank()) {
                    throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
                }
                ExtractedPage page = new ExtractedPage(1, ocrOut.text(), true, ocrOut.confidence(), ocrOut.engine(), List.of());
                return buildSummary("IMAGE", List.of(page), true, ocrOut.engine());
            } finally {
                Files.deleteIfExists(tempImg);
            }
        } catch (AppException ex) {
            throw ex;
        } catch (Exception ex) {
            logger.error("Image OCR failed: {}", ex.getMessage());
            throw new AppException(ErrorCode.DOCUMENT_EXTRACTION_FAILED);
        }
    }

    private record OcrOutput(String text, double confidence, String engine) {}

    private OcrOutput runOcrOnBufferedImage(BufferedImage image) throws IOException {
        Path tempPng = Files.createTempFile("toeic_pdf_page_", ".png");
        try {
            ImageIO.write(image, "png", tempPng.toFile());
            return runOcrOnImageFile(tempPng);
        } finally {
            Files.deleteIfExists(tempPng);
        }
    }

    private OcrOutput runOcrOnImageFile(Path imagePath) {
        // 1. Try Tesseract CLI if installed on Linux/VPS or Windows PATH
        OcrOutput tess = tryTesseractCli(imagePath);
        if (tess != null && countMeaningfulAlnum(tess.text()) >= 15) {
            return tess;
        }

        // 2. Try RapidOCR Python bridge (column-aware ONNX OCR engine)
        OcrOutput rapid = tryRapidOcrBridge(imagePath);
        if (rapid != null && !rapid.text().isBlank()) {
            return rapid;
        }

        // 3. Optional OpenAI Vision OCR fallback if configured
        if (openAiApiKey != null && !openAiApiKey.isBlank()) {
            OcrOutput vision = tryOpenAiVisionOcr(imagePath);
            if (vision != null && !vision.text().isBlank()) {
                return vision;
            }
        }

        return new OcrOutput("", 0.0, "OCR_UNAVAILABLE");
    }

    private OcrOutput tryTesseractCli(Path imagePath) {
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "tesseract",
                    imagePath.toAbsolutePath().toString(),
                    "stdout",
                    "-l", "eng",
                    "--psm", "6"
            );
            pb.redirectErrorStream(false);
            Process proc = pb.start();
            String stdout = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = proc.waitFor(25, TimeUnit.SECONDS);
            if (finished && proc.exitValue() == 0 && !stdout.trim().isEmpty()) {
                return new OcrOutput(stdout.trim(), 0.88, "TESSERACT_CLI");
            }
        } catch (Exception ignored) {
            // Tesseract binary not on PATH; proceed to RapidOCR bridge
        }
        return null;
    }

    private OcrOutput tryRapidOcrBridge(Path imagePath) {
        Path script = resolveScriptPath("ocr_bridge.py");
        if (script == null) {
            return null;
        }
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    pythonBin,
                    script.toAbsolutePath().toString(),
                    imagePath.toAbsolutePath().toString()
            );
            pb.redirectErrorStream(false);
            Process proc = pb.start();
            String stdout = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            boolean finished = proc.waitFor(45, TimeUnit.SECONDS);
            if (finished && proc.exitValue() == 0 && !stdout.isBlank()) {
                Map<String, Object> parsed = objectMapper.readValue(stdout.trim(), new TypeReference<>() {});
                String text = parsed.get("text") != null ? String.valueOf(parsed.get("text")).trim() : "";
                double conf = parsed.get("confidence") instanceof Number n ? n.doubleValue() : 0.85;
                String eng = parsed.get("engine") != null ? String.valueOf(parsed.get("engine")) : "RAPID_OCR";
                return new OcrOutput(text, conf, eng);
            }
        } catch (Exception ex) {
            logger.debug("RapidOCR bridge error: {}", ex.getMessage());
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private OcrOutput tryOpenAiVisionOcr(Path imagePath) {
        try {
            byte[] imgBytes = Files.readAllBytes(imagePath);
            String b64 = Base64.getEncoder().encodeToString(imgBytes);
            String dataUri = "data:image/png;base64," + b64;
            Map<String, Object> payload = Map.of(
                    "model", openAiModel == null || openAiModel.isBlank() ? "gpt-4o-mini" : openAiModel,
                    "messages", List.of(Map.of(
                            "role", "user",
                            "content", List.of(
                                    Map.of("type", "text", "text",
                                            "Transcribe ALL English TOEIC text verbatim from this image. Preserve question numbers, (A)(B)(C)(D) choices, paragraphs, tables, and page headings. Do not add explanations."),
                                    Map.of("type", "image_url", "image_url", Map.of("url", dataUri))
                            )
                    ))
            );
            okhttp3.OkHttpClient client = new okhttp3.OkHttpClient.Builder()
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(45, TimeUnit.SECONDS)
                    .build();
            okhttp3.Request req = new okhttp3.Request.Builder()
                    .url(openAiBaseUrl == null || openAiBaseUrl.isBlank()
                            ? "https://api.openai.com/v1/chat/completions"
                            : openAiBaseUrl)
                    .header("Authorization", "Bearer " + openAiApiKey.trim())
                    .header("Content-Type", "application/json")
                    .post(okhttp3.RequestBody.create(
                            objectMapper.writeValueAsString(payload),
                            okhttp3.MediaType.parse("application/json; charset=utf-8")
                    ))
                    .build();
            try (okhttp3.Response res = client.newCall(req).execute()) {
                if (res.isSuccessful() && res.body() != null) {
                    Map<String, Object> root = objectMapper.readValue(res.body().string(), new TypeReference<>() {});
                    if (root.get("choices") instanceof List<?> choices && !choices.isEmpty()) {
                        Map<String, Object> c0 = (Map<String, Object>) choices.get(0);
                        if (c0.get("message") instanceof Map<?, ?> msg && msg.get("content") != null) {
                            return new OcrOutput(String.valueOf(msg.get("content")).trim(), 0.92, "OPENAI_VISION_OCR");
                        }
                    }
                }
            }
        } catch (Exception ex) {
            logger.debug("OpenAI Vision OCR fallback failed: {}", ex.getMessage());
        }
        return null;
    }

    private Path resolveScriptPath(String scriptName) {
        List<Path> candidates = List.of(
                Paths.get("scripts", scriptName),
                Paths.get("backend", "scripts", scriptName)
        );
        for (Path p : candidates) {
            if (Files.isRegularFile(p)) {
                return p;
            }
        }
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("scripts/" + scriptName)) {
            if (in != null) {
                Path dir = Paths.get(storageDir, "runtime_scripts").toAbsolutePath().normalize();
                Files.createDirectories(dir);
                Path target = dir.resolve(scriptName);
                Files.write(target, in.readAllBytes());
                return target;
            }
        } catch (IOException ignored) {
        }
        return null;
    }

    private String formatXwpfTable(XWPFTable table) {
        StringBuilder sb = new StringBuilder();
        for (XWPFTableRow row : table.getRows()) {
            List<String> cells = new ArrayList<>();
            for (XWPFTableCell cell : row.getTableCells()) {
                String txt = cell.getText() != null ? cell.getText().replaceAll("\\s+", " ").trim() : "";
                cells.add(txt);
            }
            if (cells.stream().anyMatch(c -> !c.isEmpty())) {
                sb.append(String.join(" | ", cells)).append("\n");
            }
        }
        return sb.toString();
    }

    private List<ExtractedPage> splitByExplicitPageMarkers(String content) {
        List<ExtractedPage> pages = new ArrayList<>();
        Matcher m = PAGE_MARKER_PATTERN.matcher(content);
        int lastStart = 0;
        int currentPageNo = 1;
        boolean foundAny = false;
        while (m.find()) {
            if (foundAny) {
                String segment = content.substring(lastStart, m.start()).trim();
                if (!segment.isEmpty()) {
                    pages.add(new ExtractedPage(currentPageNo, segment, false, 1.0, "TXT_UTF8", List.of()));
                }
            }
            currentPageNo = Integer.parseInt(m.group(1));
            lastStart = m.end();
            foundAny = true;
        }
        if (foundAny) {
            String tail = content.substring(lastStart).trim();
            if (!tail.isEmpty()) {
                pages.add(new ExtractedPage(currentPageNo, tail, false, 1.0, "TXT_UTF8", List.of()));
            }
        }
        return pages;
    }

    private DocumentExtractionResult buildSummary(
            String format,
            List<ExtractedPage> pages,
            boolean ocrUsed,
            String ocrEngine
    ) {
        StringBuilder full = new StringBuilder();
        for (ExtractedPage p : pages) {
            full.append("=== PAGE ").append(p.pageNumber()).append(" ===\n")
                    .append(p.text()).append("\n\n");
        }
        return new DocumentExtractionResult(
                format,
                pages.size(),
                ocrUsed,
                ocrEngine,
                full.toString().trim(),
                pages
        );
    }

    private String decodeTextBytes(byte[] bytes) {
        if (bytes.length >= 2 && bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xFE) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16LE);
        }
        if (bytes.length >= 2 && bytes[0] == (byte) 0xFE && bytes[1] == (byte) 0xFF) {
            return new String(bytes, 2, bytes.length - 2, StandardCharsets.UTF_16BE);
        }
        if (bytes.length >= 3 && bytes[0] == (byte) 0xEF && bytes[1] == (byte) 0xBB && bytes[2] == (byte) 0xBF) {
            return new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        }
        String utf8 = new String(bytes, StandardCharsets.UTF_8);
        if (utf8.contains("\uFFFD")) {
            return new String(bytes, Charset.forName("windows-1252"));
        }
        return utf8;
    }

    private String normalizeExtractedPageText(String text) {
        if (text == null) {
            return "";
        }
        return text.replace("\r\n", "\n")
                .replace("\r", "\n")
                .replaceAll("[ \\t]+", " ")
                .replaceAll("\n{3,}", "\n\n")
                .trim();
    }

    private int countMeaningfulAlnum(String text) {
        if (text == null) {
            return 0;
        }
        Matcher m = ALNUM_PATTERN.matcher(text);
        int count = 0;
        while (m.find()) {
            count++;
        }
        return count;
    }

    private String getExtension(String fileName) {
        if (fileName == null) {
            return "";
        }
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(dot + 1).trim().toLowerCase(Locale.ROOT);
    }

    private String sanitizeFilename(String name) {
        if (name == null || name.isBlank()) {
            return "document.bin";
        }
        String base = new File(name).getName();
        return base.replaceAll("[^A-Za-z0-9._-]", "_");
    }
}
