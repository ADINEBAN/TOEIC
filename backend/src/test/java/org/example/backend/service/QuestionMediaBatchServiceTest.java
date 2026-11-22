package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.example.backend.controller.AdminQuestionBankController;
import org.example.backend.dto.response.QuestionImportResponse;
import org.example.backend.dto.response.QuestionMediaBatchResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.entity.Question;
import org.example.backend.enums.ErrorCode;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.QuestionMapper;
import org.example.backend.repository.AiQuestionExplanationRepository;
import org.example.backend.repository.PracticeSetQuestionRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestTemplate;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class QuestionMediaBatchServiceTest {

    @TempDir
    Path tempStorageDir;

    @Mock private QuestionRepository questionRepository;
    @Mock private QuestionMapper questionMapper;
    @Mock private PracticeSetQuestionRepository practiceSetQuestionRepository;
    @Mock private DocumentTextExtractionService documentTextExtractionService;
    @Mock private TestPartQuestionRepository testPartQuestionRepository;
    @Mock private AiQuestionExplanationRepository aiQuestionExplanationRepository;

    private CloudinaryUploadService cloudinaryUploadService;
    private QuestionMediaBatchService mediaBatchService;
    private AdminQuestionBankService bankService;
    private OpenAIAnswerExplainService explainService;
    private QuestionImportService importService;

    @BeforeEach
    void setUp() {
        cloudinaryUploadService = new CloudinaryUploadService(new ObjectMapper());
        ReflectionTestUtils.setField(cloudinaryUploadService, "storageDir", tempStorageDir.toAbsolutePath().toString());
        ReflectionTestUtils.setField(cloudinaryUploadService, "cloudName", "");
        ReflectionTestUtils.setField(cloudinaryUploadService, "apiKey", "");
        ReflectionTestUtils.setField(cloudinaryUploadService, "apiSecret", "");

        mediaBatchService = new QuestionMediaBatchService(
                questionRepository,
                questionMapper,
                cloudinaryUploadService
        );
        bankService = new AdminQuestionBankService(
                questionRepository,
                practiceSetQuestionRepository,
                questionMapper
        );
        explainService = new OpenAIAnswerExplainService(
                new RestTemplate(),
                new ObjectMapper(),
                testPartQuestionRepository,
                practiceSetQuestionRepository,
                questionRepository,
                aiQuestionExplanationRepository
        );
        QuestionImportParser parser = new QuestionImportParser(
                documentTextExtractionService,
                new ToeicDocumentParserService()
        );
        importService = new QuestionImportService(
                parser,
                bankService,
                questionRepository,
                explainService,
                mediaBatchService
        );

        lenient().when(questionMapper.toResponseList(anyList())).thenAnswer(inv -> {
            List<Question> entities = inv.getArgument(0);
            return entities.stream().map(q -> {
                QuestionResponse r = new QuestionResponse();
                r.setId(q.getId());
                r.setPartNo(q.getPartNo());
                r.setQuestionText(q.getQuestionText());
                r.setAudioUrl(q.getAudioUrl());
                r.setImageUrl(q.getImageUrl());
                r.setQuestionGroupCode(q.getQuestionGroupCode());
                return r;
            }).toList();
        });
    }

    @Test
    void matchesZipMediaByRelativePathBasenameAndGroupCodeAndStoresOnDiskOncePerAsset() throws Exception {
        Question q1 = new Question();
        q1.setId(101L);
        q1.setPartNo(1);
        q1.setQuestionText("[Test 1 - Q1] Office typing");
        q1.setAudioUrl("Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part1_Q01.mp3");
        q1.setImageUrl("Images/part1_q1.jpg");
        q1.setQuestionGroupCode("T1_P01_Q01");

        Question q32 = new Question();
        q32.setId(132L);
        q32.setPartNo(3);
        q32.setQuestionText("Where does the conversation take place?");
        q32.setAudioUrl("Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part3_Q32-34.mp3");
        q32.setQuestionGroupCode("T1_P03_32_34");

        Question q33 = new Question();
        q33.setId(133L);
        q33.setPartNo(3);
        q33.setQuestionText("What will the woman do next?");
        q33.setAudioUrl("Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part3_Q32-34.mp3");
        q33.setQuestionGroupCode("T1_P03_32_34");

        Question qNoUrl = new Question();
        qNoUrl.setId(107L);
        qNoUrl.setPartNo(2);
        qNoUrl.setQuestionText("[Test 1 - Q7] Question with group code only");
        qNoUrl.setQuestionGroupCode("T1_P02_Q07");

        Question qTest2AlreadyLinked = new Question();
        qTest2AlreadyLinked.setId(201L);
        qTest2AlreadyLinked.setPartNo(1);
        qTest2AlreadyLinked.setQuestionText("[Test 2 - Q1] Existing HTTP media");
        qTest2AlreadyLinked.setAudioUrl("https://cdn.example.com/test2/Part1_Q01.mp3");
        qTest2AlreadyLinked.setQuestionGroupCode("T2_P01_Q01");

        when(questionRepository.findAllByOrderByCreatedAtDesc())
                .thenReturn(List.of(q1, q32, q33, qNoUrl, qTest2AlreadyLinked));
        when(questionRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        byte[] p1AudioBytes = "ID3-part1-audio-content".getBytes(StandardCharsets.UTF_8);
        byte[] p3AudioBytes = "ID3-part3-shared-content".getBytes(StandardCharsets.UTF_8);
        byte[] p2GroupBytes = "ID3-part2-group-content".getBytes(StandardCharsets.UTF_8);
        byte[] imgBytes = new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0};

        byte[] zipBytes;
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream(); ZipOutputStream zos = new ZipOutputStream(baos)) {
            writeZip(zos, "Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part1_Q01.mp3", p1AudioBytes);
            writeZip(zos, "Audio_Part1_to_Part4/Tung_Cau_Va_Nhom/Part3_Q32-34.mp3", p3AudioBytes);
            writeZip(zos, "T1_P02_Q07.mp3", p2GroupBytes);
            writeZip(zos, "Images/part1_q1.jpg", imgBytes);
            writeZip(zos, "Extra_Unmatched.mp3", new byte[]{1, 2, 3});
            writeZip(zos, "De_01_Admin_Import_200Cau.xlsx", new byte[]{1, 2, 3});
            zipBytes = baos.toByteArray();
        }

        MockMultipartFile zipFile = new MockMultipartFile(
                "files",
                "De_01_Media.zip",
                "application/zip",
                zipBytes
        );

        QuestionMediaBatchResponse resp = mediaBatchService.uploadMediaBatch(List.of(zipFile), null, false);
        assertEquals(5, resp.getUploadedFileCount());
        assertEquals(4, resp.getStoredAssetCount());
        assertEquals(4, resp.getMatchedQuestionCount());
        assertEquals(1, resp.getSkippedAlreadyLinkedCount());
        assertEquals(List.of("Extra_Unmatched.mp3"), resp.getUnmatchedFiles());

        assertTrue(q1.getAudioUrl().startsWith("/api/media/question-media/audio/"));
        assertTrue(q1.getImageUrl().startsWith("/api/media/question-media/images/"));
        assertEquals(q32.getAudioUrl(), q33.getAudioUrl(), "Part 3 group questions must share one stored URL");
        assertTrue(qNoUrl.getAudioUrl().startsWith("/api/media/question-media/audio/"));
        assertEquals("https://cdn.example.com/test2/Part1_Q01.mp3", qTest2AlreadyLinked.getAudioUrl());

        // Verify exact bytes exist on disk and only 3 audio + 1 image stored (no Extra_Unmatched)
        List<Path> storedAudios = Files.list(tempStorageDir.resolve("uploads/question-media/audio")).toList();
        List<Path> storedImages = Files.list(tempStorageDir.resolve("uploads/question-media/images")).toList();
        assertEquals(3, storedAudios.size());
        assertEquals(1, storedImages.size());
        assertArrayEquals(imgBytes, Files.readAllBytes(storedImages.get(0)));

        // groupPrefix filter limits to T2_ and overwriteExisting=true replaces HTTP URL
        MockMultipartFile t2Audio = new MockMultipartFile(
                "files", "Part1_Q01.mp3", "audio/mpeg", "ID3-t2-new".getBytes(StandardCharsets.UTF_8));
        QuestionMediaBatchResponse t2Resp = mediaBatchService.uploadMediaBatch(List.of(t2Audio), "T2_", true);
        assertEquals(1, t2Resp.getMatchedQuestionCount());
        assertTrue(qTest2AlreadyLinked.getAudioUrl().startsWith("/api/media/question-media/audio/"));
    }

    @Test
    void importFileAcceptsBundleZipAndPopulatesRealUrlsBeforeSaving() throws Exception {
        byte[] xlsxBytes;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Questions");
            Row header = sheet.createRow(0);
            String[] cols = {"part", "question", "optionA", "optionB", "optionC", "optionD", "correct", "audio", "image", "group"};
            for (int i = 0; i < cols.length; i++) {
                header.createCell(i).setCellValue(cols[i]);
            }
            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue(1);
            r1.createCell(1).setCellValue("[Bundle Test - Q1] Choosing photo.");
            r1.createCell(2).setCellValue("A");
            r1.createCell(3).setCellValue("B");
            r1.createCell(4).setCellValue("C");
            r1.createCell(5).setCellValue("D");
            r1.createCell(6).setCellValue("B");
            r1.createCell(7).setCellValue("Audio/Part1_Q01.mp3");
            r1.createCell(8).setCellValue("Images/part1_q1.jpg");
            r1.createCell(9).setCellValue("TB_P01_Q01");
            wb.write(out);
            xlsxBytes = out.toByteArray();
        }

        byte[] bundleBytes;
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream(); ZipOutputStream zos = new ZipOutputStream(baos)) {
            writeZip(zos, "De_Admin_Import.xlsx", xlsxBytes);
            writeZip(zos, "Audio/Part1_Q01.mp3", "ID3-bundle".getBytes(StandardCharsets.UTF_8));
            writeZip(zos, "Images/part1_q1.jpg", new byte[]{1, 2, 3, 4});
            bundleBytes = baos.toByteArray();
        }

        when(questionRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of());
        when(questionRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));

        MockMultipartFile bundleFile = new MockMultipartFile(
                "file", "De_01_Bundle.zip", "application/zip", bundleBytes);
        QuestionImportResponse result = importService.importFromFile(bundleFile, 1, false);
        assertEquals(1, result.getImportedCount());
        QuestionResponse imported = result.getItems().get(0);
        assertTrue(imported.getAudioUrl().startsWith("/api/media/question-media/audio/"));
        assertTrue(imported.getImageUrl().startsWith("/api/media/question-media/images/"));
    }

    @Test
    void controllerUploadEndpointsDelegateCleanlyAndRejectUnsupportedType() throws Exception {
        AdminQuestionBankController controller = new AdminQuestionBankController(
                bankService,
                importService,
                mediaBatchService,
                cloudinaryUploadService,
                explainService
        );
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        MockMultipartFile mp3 = new MockMultipartFile(
                "file", "sample_part2.mp3", "audio/mpeg", "ID3-single".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(multipart("/admin/questions/upload-media").file(mp3))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mediaType").value("AUDIO"))
                .andExpect(jsonPath("$.data.url").value(org.hamcrest.Matchers.containsString("/media/question-media/audio/")));

        MockMultipartFile badFile = new MockMultipartFile(
                "file", "payload.exe", "application/octet-stream", new byte[]{1, 2, 3});
        AppException ex = assertThrows(AppException.class, () -> controller.uploadSingleQuestionMedia(badFile));
        assertEquals(ErrorCode.INVALID_QUESTION_MEDIA, ex.getErrorCode());

        when(questionRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of());
        mockMvc.perform(multipart("/admin/questions/upload-media-batch")
                        .file(new MockMultipartFile("files", "orphan.mp3", "audio/mpeg", "ID3".getBytes(StandardCharsets.UTF_8))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.uploadedFileCount").value(1))
                .andExpect(jsonPath("$.data.matchedQuestionCount").value(0));
    }

    private static void writeZip(ZipOutputStream zos, String name, byte[] data) throws Exception {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(data);
        zos.closeEntry();
    }
}
