package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.example.backend.dto.request.ConfirmDocumentExamRequest;
import org.example.backend.dto.response.ImportedDocumentResponse;
import org.example.backend.dto.response.TestResponse;
import org.example.backend.entity.*;
import org.example.backend.enums.ErrorCode;
import org.example.backend.enums.UserRole;
import org.example.backend.exception.AppException;
import org.example.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DocumentExamPipelineTest {

    @TempDir
    Path tempDir;

    @Mock private UserRepository userRepository;
    @Mock private ImportedDocumentRepository importedDocumentRepository;
    @Mock private ImportedDocumentPassageRepository passageRepository;
    @Mock private ImportedDocumentQuestionRepository docQuestionRepository;
    @Mock private TestRepository testRepository;
    @Mock private TestPartRepository testPartRepository;
    @Mock private QuestionRepository questionRepository;
    @Mock private TestPartQuestionRepository testPartQuestionRepository;

    private ObjectMapper objectMapper;
    private DocumentTextExtractionService extractionService;
    private ToeicDocumentParserService parserService;
    private ToeicDocumentValidationService validationService;
    private DocumentExamService documentExamService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        extractionService = new DocumentTextExtractionService(objectMapper);
        ReflectionTestUtils.setField(extractionService, "storageDir", tempDir.toString());
        ReflectionTestUtils.setField(extractionService, "pythonBin", "python");

        parserService = new ToeicDocumentParserService();
        validationService = new ToeicDocumentValidationService(objectMapper);

        documentExamService = new DocumentExamService(
                userRepository,
                importedDocumentRepository,
                passageRepository,
                docQuestionRepository,
                testRepository,
                testPartRepository,
                questionRepository,
                testPartQuestionRepository,
                extractionService,
                parserService,
                validationService,
                objectMapper
        );
    }

    @Test
    void extractsPart5PdfPreservingExactOriginalTextAndPageNumbers() throws Exception {
        byte[] pdfBytes = buildTextPdf(List.of(
                """
                PART 5
                101. The marketing director will ------- the quarterly sales strategy on Friday.
                (A) review (B) reviewed (C) reviewing (D) reviewer
                102. All visitors must present ------- identification cards at the main reception desk.
                (A) they (B) them (C) their (D) theirs

                ANSWER KEY
                101. A
                102. C
                """
        ));

        var extraction = extractionService.extract("part5_sample.pdf", pdfBytes);
        var parsed = parserService.parse(extraction);

        assertEquals("PDF", extraction.detectedFormat());
        assertEquals(1, extraction.pageCount());
        assertFalse(extraction.ocrUsed());
        assertEquals(2, parsed.questions().size());

        var q101 = parsed.questions().get(0);
        assertEquals(5, q101.partNo());
        assertEquals(101, q101.originalQuestionNumber());
        assertEquals(1, q101.pageNumber());
        assertEquals("The marketing director will ------- the quarterly sales strategy on Friday.", q101.questionText());
        assertEquals("A", q101.officialCorrectLabel());
        assertTrue(q101.answerKeyVerified());
        assertEquals(4, q101.options().size());
        assertEquals("review", q101.options().get(0).optionText());

        var q102 = parsed.questions().get(1);
        assertEquals("C", q102.officialCorrectLabel());
        assertTrue(q102.answerKeyVerified());
    }

    @Test
    void extractsPart6TextCompletionWithIntactPassageAndBlanks() throws Exception {
        byte[] pdfBytes = buildTextPdf(List.of(
                """
                PART 6
                Questions 131-132 refer to the following notice.
                To all Apex Logistics staff:
                Effective November 1, employees should [131] all travel reimbursement forms through the portal.
                Paper receipts must be scanned clearly [132] submission.

                131. (A) submit (B) submits (C) submitting (D) submission
                132. (A) prior to (B) regardless (C) despite (D) between
                """
        ));

        var extraction = extractionService.extract("part6_notice.pdf", pdfBytes);
        var parsed = parserService.parse(extraction);

        assertEquals(1, parsed.passages().size());
        assertEquals(6, parsed.passages().get(0).partNo());
        assertEquals("PART6", parsed.passages().get(0).passageType());
        assertTrue(parsed.passages().get(0).content().contains("Apex Logistics staff"));

        assertEquals(2, parsed.questions().size());
        assertEquals(6, parsed.questions().get(0).partNo());
        assertEquals(parsed.passages().get(0).passageCode(), parsed.questions().get(0).passageCode());
        // No answer key -> MUST stay unverified and NOT fabricate answers
        assertFalse(parsed.questions().get(0).answerKeyVerified());
        assertNull(parsed.questions().get(0).officialCorrectLabel());
    }

    @Test
    void extractsPart7SingleAndDoublePassagesPreservingRelationships() throws Exception {
        byte[] pdfBytes = buildTextPdf(List.of(
                """
                PART 7
                Questions 147-148 refer to the following advertisement.
                Grandview Conference Hotel offers modern meeting suites for corporate workshops.
                Groups booking before October 15 receive complimentary audiovisual support.

                147. Who is this advertisement mainly intended for?
                (A) Corporate event planners (B) Hotel housekeepers (C) Flight attendants (D) Architectural students
                148. What benefit is offered to early bookings?
                (A) Free breakfast vouchers (B) Complimentary audiovisual support (C) Discounted airfare (D) Late check-out
                """,
                """
                Questions 176-177 refer to the following e-mail and schedule.
                Document 1: E-mail
                From: Clara Chen
                Subject: Workshop Venue
                Hi team, please check the updated Tuesday room assignments below.

                Document 2: Schedule
                Tuesday 09:00 AM - Room B - Finance Briefing

                176. What is scheduled in Room B on Tuesday?
                (A) Product Launch (B) Finance Briefing (C) Safety Audit (D) Board Lunch
                177. Who sent the e-mail update?
                (A) Clara Chen (B) Mark Evans (C) Sarah Park (D) David Kim
                """
        ));

        var extraction = extractionService.extract("part7_multi.pdf", pdfBytes);
        var parsed = parserService.parse(extraction);

        assertEquals(2, parsed.passages().size());
        assertEquals("SINGLE", parsed.passages().get(0).passageType());
        assertEquals("DOUBLE", parsed.passages().get(1).passageType());
        assertEquals(1, parsed.passages().get(0).pageNumber());
        assertEquals(2, parsed.passages().get(1).pageNumber());

        assertEquals(4, parsed.questions().size());
        assertEquals(parsed.passages().get(0).passageCode(), parsed.questions().get(0).passageCode());
        assertEquals(parsed.passages().get(1).passageCode(), parsed.questions().get(2).passageCode());
        assertEquals(2, parsed.questions().get(2).pageNumber());
    }

    @Test
    void excludesParts1To4WhenCombinedDocumentContainsAllPartsAndExtractsOnlyPart5To7() throws Exception {
        byte[] pdfBytes = buildTextPdf(List.of(
                """
                PART 1
                1. Look at the picture marked number 1 in your test book.
                (A) She is typing on a laptop. (B) She is watering a plant. (C) She is opening a window. (D) She is sweeping the floor.

                PART 5
                101. The engineering division ------- a revised safety manual last week.
                (A) publish (B) published (C) publishing (D) publisher

                PART 6
                Questions 131-131 refer to the following memo.
                All staff should [131] their badges before entering Laboratory B.
                131. (A) scan (B) scanned (C) scanning (D) scans

                PART 7
                Questions 147-147 refer to the following notice.
                The cafeteria will close early at 3:00 P.M. for annual equipment inspection.
                147. Why will the cafeteria close early?
                (A) For annual equipment inspection (B) For a staff wedding (C) Due to severe snow (D) For kitchen relocation
                """
        ));

        var extraction = extractionService.extract("combined_all_parts.pdf", pdfBytes);
        var parsed = parserService.parse(extraction);

        assertTrue(parsed.excludedListeningParts());
        assertEquals(3, parsed.questions().size());
        assertTrue(parsed.questions().stream().allMatch(q -> q.partNo() >= 5 && q.partNo() <= 7));
        assertFalse(parsed.questions().stream().anyMatch(q -> q.originalQuestionNumber() != null && q.originalQuestionNumber() == 1));
    }

    @Test
    void extractsScannedPdfThroughOcrPipelineAndHandlesWordTables() throws Exception {
        // 1. Create a pure bitmap Scanned PDF (zero selectable text layer) and test real OCR pipeline
        BufferedImage img = new BufferedImage(1200, 420, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, img.getWidth(), img.getHeight());
        g.setColor(Color.BLACK);
        g.setFont(new Font("SansSerif", Font.BOLD, 28));
        g.drawString("PART 5", 50, 70);
        g.setFont(new Font("SansSerif", Font.PLAIN, 24));
        g.drawString("101. Our branch manager will attend the annual conference.", 50, 140);
        g.drawString("(A) attend (B) attends (C) attending (D) attendance", 50, 200);
        g.dispose();

        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(img, "png", pngOut);

        byte[] scannedPdfBytes;
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream pdfOut = new ByteArrayOutputStream()) {
            PDPage page = new PDPage(new PDRectangle(1200, 420));
            doc.addPage(page);
            PDImageXObject pdImg = PDImageXObject.createFromByteArray(doc, pngOut.toByteArray(), "scan.png");
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(pdImg, 0, 0, 1200, 420);
            }
            doc.save(pdfOut);
            scannedPdfBytes = pdfOut.toByteArray();
        }

        var scannedExtraction = extractionService.extract("scanned_toeic.pdf", scannedPdfBytes);
        assertEquals("SCANNED_PDF", scannedExtraction.detectedFormat());
        assertTrue(scannedExtraction.ocrUsed());
        assertTrue(scannedExtraction.fullAnnotatedText().toLowerCase().contains("annual conference"));

        var scannedParsed = parserService.parse(scannedExtraction);
        assertFalse(scannedParsed.questions().isEmpty());
        assertEquals(5, scannedParsed.questions().get(0).partNo());
        assertEquals(1, scannedParsed.questions().get(0).pageNumber());

        // 2. Test DOCX extraction with paragraph + embedded XWPFTable
        byte[] docxBytes;
        try (XWPFDocument docx = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            XWPFParagraph p = docx.createParagraph();
            p.createRun().setText("PART 7\nQuestions 150-150 refer to the following schedule.");
            XWPFTable table = docx.createTable(2, 2);
            table.getRow(0).getCell(0).setText("Session");
            table.getRow(0).getCell(1).setText("Room");
            table.getRow(1).getCell(0).setText("Budget Planning");
            table.getRow(1).getCell(1).setText("Hall A");
            XWPFParagraph qPara = docx.createParagraph();
            qPara.createRun().setText("150. Where will Budget Planning be held?\n(A) Hall A (B) Hall B (C) Room C (D) Studio D");
            docx.write(out);
            docxBytes = out.toByteArray();
        }

        var docxExtraction = extractionService.extract("exam.docx", docxBytes);
        var docxParsed = parserService.parse(docxExtraction);
        assertEquals("DOCX", docxExtraction.detectedFormat());
        assertEquals(1, docxParsed.questions().size());
        assertEquals(1, docxParsed.passages().size());
        assertTrue(docxParsed.passages().get(0).content().contains("Budget Planning | Hall A"));
    }

    @Test
    void missingAnswerKeyRemainsUnverifiedAndSeparateFromAiAnalysisAndPersistsToTest() throws Exception {
        User owner = new User();
        owner.setId(7L);
        owner.setEmail("learner@toeic.test");
        owner.setRole(UserRole.USER);

        when(userRepository.findByEmail("learner@toeic.test")).thenReturn(Optional.of(owner));
        when(importedDocumentRepository.findFirstByUserIdAndSha256Hash(any(), any())).thenReturn(Optional.empty());

        AtomicLong docSeq = new AtomicLong(10);
        AtomicLong qSeq = new AtomicLong(200);
        List<ImportedDocumentQuestion> storedDocQuestions = new ArrayList<>();

        when(importedDocumentRepository.save(any())).thenAnswer(inv -> {
            ImportedDocument d = inv.getArgument(0);
            if (d.getId() == null) d.setId(docSeq.getAndIncrement());
            return d;
        });
        when(docQuestionRepository.saveAll(any())).thenAnswer(inv -> {
            Iterable<ImportedDocumentQuestion> items = inv.getArgument(0);
            List<ImportedDocumentQuestion> saved = new ArrayList<>();
            for (ImportedDocumentQuestion item : items) {
                if (item.getId() == null) item.setId(qSeq.getAndIncrement());
                saved.add(item);
            }
            storedDocQuestions.clear();
            storedDocQuestions.addAll(saved);
            return saved;
        });
        when(passageRepository.findByDocumentIdOrderBySortOrderAsc(any())).thenReturn(List.of());
        when(docQuestionRepository.findByDocumentIdOrderBySortOrderAsc(any())).thenAnswer(inv -> storedDocQuestions);
        when(importedDocumentRepository.findById(any())).thenAnswer(inv -> {
            ImportedDocument doc = new ImportedDocument();
            doc.setId(10L);
            doc.setUser(owner);
            doc.setFileName("no_key_part5.txt");
            doc.setFileFormat("TXT");
            doc.setPageCount(1);
            doc.setOcrUsed(false);
            doc.setStatus("NEEDS_REVIEW");
            return Optional.of(doc);
        });
        when(testRepository.save(any())).thenAnswer(inv -> {
            org.example.backend.entity.Test t = inv.getArgument(0);
            t.setId(99L);
            return t;
        });
        when(testPartRepository.save(any())).thenAnswer(inv -> {
            TestPart tp = inv.getArgument(0);
            tp.setId(199L);
            return tp;
        });
        when(questionRepository.save(any())).thenAnswer(inv -> {
            Question q = inv.getArgument(0);
            q.setId(300L);
            // Assert NO fabricated official correct answer was saved when source lacked an answer key
            assertTrue(q.getOptions().stream().noneMatch(o -> Boolean.TRUE.equals(o.getCorrect())));
            assertFalse(Boolean.TRUE.equals(q.getAnswerKeyVerified()));
            return q;
        });

        String rawTxt = """
                PART 5
                101. Employees who travel frequently should keep ------- receipts.
                (A) they (B) their (C) them (D) theirs
                103. Notice the missing #102 question to test validation sequence detection!
                (A) one (B) two (C) three
                """;
        MockMultipartFile file = new MockMultipartFile("file", "no_key_part5.txt", "text/plain", rawTxt.getBytes());

        ImportedDocumentResponse uploaded = documentExamService.uploadAndExtractDocument("learner@toeic.test", file);
        assertEquals(2, uploaded.getQuestions().size());
        assertEquals("NEEDS_REVIEW", uploaded.getStatus());
        // Q103 only has 3 choices -> INVALID; Q101 unverified -> WARNING
        assertEquals("WARNING", uploaded.getQuestions().get(0).getValidationStatus());
        assertEquals("INVALID", uploaded.getQuestions().get(1).getValidationStatus());
        assertTrue(((List<?>) uploaded.getValidationSummary().get("missingNumbersInSequence")).contains(102));

        // Separate AI analysis must NEVER fabricate an official verified key
        ImportedDocumentResponse aiAnalyzed = documentExamService.analyzeAnswersWithAi("learner@toeic.test", 10L);
        assertFalse(aiAnalyzed.getQuestions().get(0).getAnswerKeyVerified());
        assertNull(aiAnalyzed.getQuestions().get(0).getOfficialCorrectLabel());

        // Confirm exam generates persisted Test scoped to owner
        ConfirmDocumentExamRequest confirmReq = new ConfirmDocumentExamRequest();
        confirmReq.setSelectedParts(List.of(5));
        TestResponse generatedTest = documentExamService.confirmAndGenerateExam("learner@toeic.test", 10L, confirmReq);
        assertEquals(99L, generatedTest.getId());
        assertFalse(generatedTest.getPublished());

        // Multi-user permission check: different user MUST be rejected
        User intruder = new User();
        intruder.setId(88L);
        intruder.setEmail("other@toeic.test");
        intruder.setRole(UserRole.USER);
        when(userRepository.findByEmail("other@toeic.test")).thenReturn(Optional.of(intruder));
        AppException authEx = assertThrows(AppException.class,
                () -> documentExamService.getDocumentDetail("other@toeic.test", 10L));
        assertEquals(ErrorCode.INVALID_TOKEN, authEx.getErrorCode());
    }

    @Test
    void extractsAllSupportedFormatsPdfDocxDocTxtAndImagesEndToEnd() throws Exception {
        // 1. TXT (UTF-8 + UTF-16LE BOM)
        String sampleTxt = """
                PART 5
                101. All department heads must submit travel vouchers before Friday.
                (A) submits (B) submit (C) submitting (D) submission
                """;
        var utf8Txt = extractionService.extract("part5.txt", sampleTxt.getBytes(StandardCharsets.UTF_8));
        assertEquals("TXT", utf8Txt.detectedFormat());
        assertEquals(1, parserService.parse(utf8Txt).questions().size());

        byte[] bom = new byte[]{(byte) 0xFF, (byte) 0xFE};
        byte[] u16Body = sampleTxt.getBytes(StandardCharsets.UTF_16LE);
        byte[] u16Bytes = new byte[bom.length + u16Body.length];
        System.arraycopy(bom, 0, u16Bytes, 0, bom.length);
        System.arraycopy(u16Body, 0, u16Bytes, bom.length, u16Body.length);
        var u16Txt = extractionService.extract("utf16.txt", u16Bytes);
        assertEquals(1, parserService.parse(u16Txt).questions().size());

        // 2. DOCX standard text + extensionless magic-byte sniffing
        byte[] docxBytes;
        try (XWPFDocument docx = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            docx.createParagraph().createRun().setText("PART 5\n102. The client appreciated our prompt response.\n(A) prompt (B) promptly (C) promptness (D) prompts");
            docx.write(out);
            docxBytes = out.toByteArray();
        }
        assertEquals(1, parserService.parse(extractionService.extract("toeic.docx", docxBytes)).questions().size());
        // Simulated Android URI asset without extension (sniffs ZIP/DOCX cleanly)
        assertEquals("DOCX", extractionService.extract("uploaded_document", docxBytes).detectedFormat());

        // 3. DOCX containing ONLY a pasted image screenshot -> falls back to embedded image OCR
        BufferedImage img = buildToeicQuestionImage(false);
        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(img, "png", pngOut);
        byte[] imageOnlyDocx;
        try (XWPFDocument docx = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            docx.addPictureData(pngOut.toByteArray(), org.apache.poi.xwpf.usermodel.Document.PICTURE_TYPE_PNG);
            docx.write(out);
            imageOnlyDocx = out.toByteArray();
        }
        var docxOcrRes = extractionService.extract("screenshot_inside.docx", imageOnlyDocx);
        assertEquals("DOCX", docxOcrRes.detectedFormat());
        assertTrue(docxOcrRes.ocrUsed());
        assertFalse(parserService.parse(docxOcrRes).questions().isEmpty());

        // 4. .doc variants (disguised OOXML saved as .doc + RTF saved as .doc)
        var disguisedDoc = extractionService.extract("renamed.doc", docxBytes);
        assertEquals("DOCX", disguisedDoc.detectedFormat());
        String rtfDoc = "{\\rtf1\\ansi PART 5\\line 103. Please review the attached invoice carefully.\\line (A) review (B) reviews (C) reviewed (D) reviewing}";
        var rtfExtracted = extractionService.extract("legacy_export.doc", rtfDoc.getBytes(StandardCharsets.UTF_8));
        assertEquals("DOC", rtfExtracted.detectedFormat());
        assertEquals(1, parserService.parse(rtfExtracted).questions().size());

        // 5. Text-based PDF
        byte[] pdfBytes = buildTextPdf(List.of("PART 5\n104. Ms. Lin was promoted to regional director.\n(A) promote (B) promoted (C) promoting (D) promotion"));
        var pdfRes = extractionService.extract("text_based.pdf", pdfBytes);
        assertEquals("PDF", pdfRes.detectedFormat());
        assertEquals(1, parserService.parse(pdfRes).questions().size());

        // 6. Image formats via OCR (PNG, JPG, BMP, WEBP)
        for (String fmt : List.of("png", "jpg", "bmp")) {
            ByteArrayOutputStream imgStream = new ByteArrayOutputStream();
            ImageIO.write(img, fmt, imgStream);
            var imgRes = extractionService.extract("scan." + fmt, imgStream.toByteArray());
            assertEquals("IMAGE", imgRes.detectedFormat());
            assertTrue(imgRes.ocrUsed(), "OCR must succeed for " + fmt);
            assertFalse(
                    parserService.parse(imgRes).questions().isEmpty(),
                    "Parser must extract question for " + fmt + " | text=" + imgRes.fullAnnotatedText()
            );
        }

        // Generate real WEBP via Pillow in tempDir & verify WEBP OCR
        Path webpPath = tempDir.resolve("scan.webp");
        Path pngTemp = tempDir.resolve("src.png");
        Files.write(pngTemp, pngOut.toByteArray());
        Process p = new ProcessBuilder("python", "-c",
                "from PIL import Image; Image.open(r'" + pngTemp.toAbsolutePath() + "').save(r'" + webpPath.toAbsolutePath() + "')")
                .start();
        assertEquals(0, p.waitFor());
        var webpRes = extractionService.extract("scan.webp", Files.readAllBytes(webpPath));
        assertEquals("IMAGE", webpRes.detectedFormat());
        assertTrue(webpRes.ocrUsed());
        assertFalse(parserService.parse(webpRes).questions().isEmpty());
    }

    private BufferedImage buildToeicQuestionImage(boolean alpha) {
        BufferedImage img = new BufferedImage(1200, 380, alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, img.getWidth(), img.getHeight());
        g.setColor(Color.BLACK);
        g.setFont(new Font("SansSerif", Font.BOLD, 30));
        g.drawString("PART 5", 50, 70);
        g.setFont(new Font("SansSerif", Font.PLAIN, 26));
        g.drawString("105. The committee approved the revised schedule yesterday.", 50, 145);
        g.drawString("(A) approve (B) approved (C) approving (D) approval", 50, 210);
        g.dispose();
        return img;
    }

    private byte[] buildTextPdf(List<String> pagesContent) throws Exception {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            for (String pageText : pagesContent) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(font, 11);
                    cs.setLeading(14.5f);
                    cs.newLineAtOffset(45, 740);
                    for (String line : pageText.split("\\r?\\n")) {
                        String safe = line.replaceAll("[^\\x20-\\x7E]", "-");
                        cs.showText(safe);
                        cs.newLine();
                    }
                    cs.endText();
                }
            }
            doc.save(out);
            return out.toByteArray();
        }
    }
}
