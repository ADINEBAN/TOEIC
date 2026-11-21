package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.example.backend.dto.request.CreateQuestionOptionRequest;
import org.example.backend.dto.request.CreateQuestionRequest;
import org.example.backend.dto.request.DraftQuestionExplainRequest;
import org.example.backend.dto.response.AIExplainResponse;
import org.example.backend.dto.response.QuestionImportResponse;
import org.example.backend.dto.response.QuestionResponse;
import org.example.backend.entity.Question;
import org.example.backend.exception.AppException;
import org.example.backend.mapper.QuestionMapper;
import org.example.backend.repository.AiQuestionExplanationRepository;
import org.example.backend.repository.PracticeSetQuestionRepository;
import org.example.backend.repository.QuestionRepository;
import org.example.backend.repository.TestPartQuestionRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.client.RestTemplate;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminQuestionBankUpgradeTest {

    @Mock
    private QuestionRepository questionRepository;
    @Mock
    private PracticeSetQuestionRepository practiceSetQuestionRepository;
    @Mock
    private QuestionMapper questionMapper;
    @Mock
    private DocumentTextExtractionService documentTextExtractionService;
    @Mock
    private TestPartQuestionRepository testPartQuestionRepository;
    @Mock
    private AiQuestionExplanationRepository aiQuestionExplanationRepository;

    @Test
    void rejectsOutOfRangePartNumberAboveSeven() {
        AdminQuestionBankService service = new AdminQuestionBankService(
                questionRepository,
                practiceSetQuestionRepository,
                questionMapper
        );

        CreateQuestionRequest bad = new CreateQuestionRequest();
        bad.setPartNo(12);
        bad.setQuestionText("Sample question");
        CreateQuestionOptionRequest opt = new CreateQuestionOptionRequest();
        opt.setOptionLabel("A");
        opt.setOptionText("Option A");
        opt.setCorrect(true);
        bad.setOptions(List.of(opt));

        assertThrows(AppException.class, () -> service.createQuestion(bad));
    }

    @Test
    void parsesExcelXlsxQuestionsAndImportsWithDeduplication() throws Exception {
        byte[] xlsxBytes;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Questions");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("Part");
            header.createCell(1).setCellValue("Question");
            header.createCell(2).setCellValue("A");
            header.createCell(3).setCellValue("B");
            header.createCell(4).setCellValue("C");
            header.createCell(5).setCellValue("D");
            header.createCell(6).setCellValue("Correct");
            header.createCell(7).setCellValue("Explanation");

            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue(5);
            r1.createCell(1).setCellValue("I realized that I ___ my wallet at home.");
            r1.createCell(2).setCellValue("left");
            r1.createCell(3).setCellValue("leave");
            r1.createCell(4).setCellValue("leaving");
            r1.createCell(5).setCellValue("leaves");
            r1.createCell(6).setCellValue("A");

            Row r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue("Part 5");
            r2.createCell(1).setCellValue("The board will ___ the new policy next week.");
            r2.createCell(2).setCellValue("approve");
            r2.createCell(3).setCellValue("approval");
            r2.createCell(4).setCellValue("approving");
            r2.createCell(5).setCellValue("approved");
            r2.createCell(6).setCellValue("A");
            r2.createCell(7).setCellValue("Sau 'will' cần động từ nguyên mẫu.");

            wb.write(out);
            xlsxBytes = out.toByteArray();
        }

        Question existing = new Question();
        existing.setPartNo(5);
        existing.setQuestionText("I realized that I ___ my wallet at home.");

        when(questionRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(existing));
        when(questionRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(questionMapper.toResponseList(anyList())).thenAnswer(inv -> {
            List<Question> saved = inv.getArgument(0);
            return saved.stream().map(q -> {
                QuestionResponse r = new QuestionResponse();
                r.setPartNo(q.getPartNo());
                r.setQuestionText(q.getQuestionText());
                r.setExplanation(q.getExplanation());
                return r;
            }).toList();
        });

        QuestionImportParser parser = new QuestionImportParser(
                documentTextExtractionService,
                new ToeicDocumentParserService()
        );
        AdminQuestionBankService bankService = new AdminQuestionBankService(
                questionRepository,
                practiceSetQuestionRepository,
                questionMapper
        );
        OpenAIAnswerExplainService explainService = new OpenAIAnswerExplainService(
                new RestTemplate(),
                new ObjectMapper(),
                testPartQuestionRepository,
                practiceSetQuestionRepository,
                questionRepository,
                aiQuestionExplanationRepository
        );
        QuestionImportService importService = new QuestionImportService(
                parser,
                bankService,
                questionRepository,
                explainService
        );

        MockMultipartFile file = new MockMultipartFile(
                "file",
                "questions.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                xlsxBytes
        );

        QuestionImportResponse result = importService.importFromFile(file, 5, false);
        assertEquals(2, result.getTotalParsed());
        assertEquals(1, result.getSkippedDuplicateCount());
        assertEquals(1, result.getImportedCount());
        assertEquals(5, result.getItems().get(0).getPartNo());
        assertEquals("The board will ___ the new policy next week.", result.getItems().get(0).getQuestionText());
    }

    @Test
    void parsesWordDocxTableAndDraftExplainFallback() throws Exception {
        byte[] docxBytes;
        try (XWPFDocument doc = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            XWPFTable table = doc.createTable(2, 7);
            table.getRow(0).getCell(0).setText("Part");
            table.getRow(0).getCell(1).setText("Question");
            table.getRow(0).getCell(2).setText("A");
            table.getRow(0).getCell(3).setText("B");
            table.getRow(0).getCell(4).setText("C");
            table.getRow(0).getCell(5).setText("D");
            table.getRow(0).getCell(6).setText("Correct");

            table.getRow(1).getCell(0).setText("6");
            table.getRow(1).getCell(1).setText("Please submit the invoice ___ Friday.");
            table.getRow(1).getCell(2).setText("by");
            table.getRow(1).getCell(3).setText("until");
            table.getRow(1).getCell(4).setText("since");
            table.getRow(1).getCell(5).setText("among");
            table.getRow(1).getCell(6).setText("A");

            doc.write(out);
            docxBytes = out.toByteArray();
        }

        QuestionImportParser parser = new QuestionImportParser(
                documentTextExtractionService,
                new ToeicDocumentParserService()
        );
        List<CreateQuestionRequest> parsed = parser.parse("part6.docx", docxBytes, 5);
        assertEquals(1, parsed.size());
        assertEquals(6, parsed.get(0).getPartNo());
        assertEquals("Please submit the invoice ___ Friday.", parsed.get(0).getQuestionText());
        assertTrue(parsed.get(0).getOptions().get(0).getCorrect());

        OpenAIAnswerExplainService explainService = new OpenAIAnswerExplainService(
                new RestTemplate(),
                new ObjectMapper(),
                testPartQuestionRepository,
                practiceSetQuestionRepository,
                questionRepository,
                aiQuestionExplanationRepository
        );
        DraftQuestionExplainRequest draft = new DraftQuestionExplainRequest();
        draft.setPartNo(6);
        draft.setQuestionText("Please submit the invoice ___ Friday.");
        draft.setOptionA("by");
        draft.setOptionB("until");
        draft.setOptionC("since");
        draft.setOptionD("among");
        draft.setCorrectLabel("A");

        AIExplainResponse res = explainService.generateDraftExplanation(draft);
        assertNotNull(res);
        assertTrue(res.getExplanation().contains("Đáp án đúng là A"));
    }

    @Test
    void parsesMixedPart5Part6InlineAndUnnumberedPart7FromMsHoaExamDoc() {
        String sampleExam = """
                ĐỀ THI TOEIC READING ( PART 5, 6, 7 )
                 MS HOA TOEIC BIÊN SOẠN
                ĐỀ 1
                Its…………into Brazil has given Darrow Textiles Ltd. an advantage over much of its competition.
                expansion
                process
                creation
                action
                Employees at NC media co., Ltd…………donate to local charities by hosting Fund-raising parties.
                A. regularity
                B. regularize
                C. regularities
                D. regularly
                PART 6:
                Questions 41-43 refer to the following article.
                [TABLE]
                Although this was ….(41)... a shelter for people to escape, it has now  (A) just  (B) once  (C) such  (D) likely  become a chaotic market area. Most of them….(42)…  (A) would have agreed  (B) would agree  (C) has agree  (D) were agreeing  that it has gotten out of control. .…(43)…., it might have already gotten too far out of control. What we need is not a  (A) In fact  (B) In spite of  (C) On the other hand  (D) Even though  mere intervention.
                [/TABLE]
                Part 7Directions: In this part, you will read a selection of texts.
                Question 53-54 refer to the following announcement.
                RICH TO APPEAR AS THE FIRST GUEST
                Adrienne Rich will appear on Saturday night.
                53. What is the purpose of the announcement?
                (A) To criticize a novel
                (B) To describe a guest
                (C) To introduce a program
                (D) To raise sales
                Question 68-70 refer to the following notice.
                RESERVATIONS To ensure a table at SkyCity, reservations are recommended.
                What kind of place is SkyCity?
                A restaurant
                A ship
                A museum
                A theme park
                Question 81- 85 refer to the following announcement and schedule.
                AGP8X Corporation fitness center announcement.
                Reminders
                1. Please do not use equipment for more than 30 minutes.
                2. Members may bring a guest per visit.
                What is the purpose of this message?
                To notify employees of closure
                To inform employees of changes
                To ask for suggestions
                To complain about a trainer
                Question 91-95 refer to the following catalog page.
                Business Fashions Fall Catalog.
                Which item is available in only three colors?
                (A) Solid color men’s dress shirts
                (C) Striped sweaters
                (B) Striped men’s dress shirts
                (D) Sweaters
                """;

        DocumentTextExtractionService.DocumentExtractionResult extraction =
                new DocumentTextExtractionService.DocumentExtractionResult(
                        "DOCX", 1, false, "NONE", sampleExam,
                        List.of(new DocumentTextExtractionService.ExtractedPage(1, sampleExam, false, 1.0, "POI_DOCX", List.of()))
                );
        ToeicDocumentParserService parserService = new ToeicDocumentParserService();
        ToeicDocumentParserService.ParsedDocumentResult parsed = parserService.parse(extraction);

        long part5Count = parsed.questions().stream().filter(q -> q.partNo() == 5).count();
        long part6Count = parsed.questions().stream().filter(q -> q.partNo() == 6).count();
        long part7Count = parsed.questions().stream().filter(q -> q.partNo() == 7).count();

        assertEquals(2, part5Count, "Expected 2 Part 5 questions");
        assertEquals(3, part6Count, "Expected 3 inline Part 6 questions (41-43)");
        assertEquals(4, part7Count, "Expected 4 Part 7 questions (53, 68, 81, 91)");

        var q42 = parsed.questions().stream()
                .filter(q -> Integer.valueOf(42).equals(q.originalQuestionNumber()))
                .findFirst()
                .orElseThrow();
        assertEquals(4, q42.options().size());
        assertEquals("would agree", q42.options().get(1).optionText());
        assertEquals("were agreeing", q42.options().get(3).optionText());
    }
}
