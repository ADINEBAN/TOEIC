package org.example.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.example.backend.dto.response.FlashcardAiSuggestResponse;
import org.example.backend.dto.response.FlashcardImportResponse;
import org.example.backend.dto.response.FlashcardResponse;
import org.example.backend.entity.Flashcard;
import org.example.backend.entity.LearningModule;
import org.example.backend.entity.Vocabulary;
import org.example.backend.mapper.FlashcardMapper;
import org.example.backend.repository.DictionaryCacheEntryRepository;
import org.example.backend.repository.FlashcardRepository;
import org.example.backend.repository.LearningModuleRepository;
import org.example.backend.repository.UserDictionaryHistoryRepository;
import org.example.backend.repository.UserRepository;
import org.example.backend.repository.VocabularyRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminFlashcardImportAndAiTest {

    @Mock
    private FlashcardRepository flashcardRepository;
    @Mock
    private LearningModuleRepository learningModuleRepository;
    @Mock
    private FlashcardMapper flashcardMapper;
    @Mock
    private SmartDictionaryService smartDictionaryService;
    @Mock
    private VocabularyRepository vocabularyRepository;
    @Mock
    private DictionaryCacheEntryRepository dictionaryCacheEntryRepository;
    @Mock
    private UserDictionaryHistoryRepository userDictionaryHistoryRepository;
    @Mock
    private UserRepository userRepository;

    private final FlashcardImportParser parser = new FlashcardImportParser();

    @Test
    void parsesExcelXlsxWithMixedCompleteAndPartialRows() throws Exception {
        byte[] xlsxBytes;
        try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("Vocab");
            Row header = sheet.createRow(0);
            header.createCell(0).setCellValue("STT");
            header.createCell(1).setCellValue("Từ vựng");
            header.createCell(2).setCellValue("Nghĩa tiếng Việt");
            header.createCell(3).setCellValue("Phiên âm");
            header.createCell(4).setCellValue("Ví dụ");

            Row r1 = sheet.createRow(1);
            r1.createCell(0).setCellValue(1);
            r1.createCell(1).setCellValue("negotiate");
            r1.createCell(2).setCellValue("đàm phán");
            r1.createCell(3).setCellValue("/nɪˈɡoʊ.ʃi.eɪt/");
            r1.createCell(4).setCellValue("We will negotiate the contract tomorrow.");

            Row r2 = sheet.createRow(2);
            r2.createCell(0).setCellValue(2);
            r2.createCell(1).setCellValue("deadline");

            wb.write(out);
            xlsxBytes = out.toByteArray();
        }

        List<FlashcardImportParser.ParsedFlashcardRow> rows = parser.parse("toeic-words.xlsx", xlsxBytes);
        assertEquals(2, rows.size());
        assertEquals("negotiate", rows.get(0).englishWord());
        assertEquals("đàm phán", rows.get(0).meaningVi());
        assertEquals("/nɪˈɡoʊ.ʃi.eɪt/", rows.get(0).pronunciation());
        assertEquals("We will negotiate the contract tomorrow.", rows.get(0).exampleSentence());

        assertEquals("deadline", rows.get(1).englishWord());
        assertNull(rows.get(1).meaningVi());
    }

    @Test
    void parsesWordDocxTablesAndBulletParagraphs() throws Exception {
        byte[] docxBytes;
        try (XWPFDocument doc = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            XWPFTable table = doc.createTable(2, 4);
            table.getRow(0).getCell(0).setText("English word");
            table.getRow(0).getCell(1).setText("Meaning VI");
            table.getRow(0).getCell(2).setText("Pronunciation");
            table.getRow(0).getCell(3).setText("Example sentence");

            XWPFTableRow dataRow = table.getRow(1);
            dataRow.getCell(0).setText("revenue");
            dataRow.getCell(1).setText("doanh thu");
            dataRow.getCell(2).setText("/ˈrev.ən.juː/");
            dataRow.getCell(3).setText("Annual revenue rose by 15%.");

            XWPFParagraph p1 = doc.createParagraph();
            p1.createRun().setText("1. allocate /ˈæl.ə.keɪt/ - phân bổ");
            XWPFParagraph p2 = doc.createParagraph();
            p2.createRun().setText("- reimburse");

            doc.write(out);
            docxBytes = out.toByteArray();
        }

        List<FlashcardImportParser.ParsedFlashcardRow> rows = parser.parse("lesson.docx", docxBytes);
        assertEquals(3, rows.size());
        assertEquals("revenue", rows.get(0).englishWord());
        assertEquals("doanh thu", rows.get(0).meaningVi());
        assertEquals("allocate", rows.get(1).englishWord());
        assertEquals("/ˈæl.ə.keɪt/", rows.get(1).pronunciation());
        assertEquals("phân bổ", rows.get(1).meaningVi());
        assertEquals("reimburse", rows.get(2).englishWord());
    }

    @Test
    void importsWithAiAutoEnrichmentAndDeduplicatesExistingCards() {
        LearningModule module = new LearningModule();
        module.setId(33L);

        Flashcard existingCard = new Flashcard();
        existingCard.setEnglishWord("Negotiate");

        when(learningModuleRepository.findById(33L)).thenReturn(Optional.of(module));
        when(flashcardRepository.findAllByModuleIdOrderByCreatedAtDesc(33L)).thenReturn(List.of(existingCard));
        when(smartDictionaryService.batchSuggestFlashcards(List.of("deadline"))).thenReturn(Map.of(
                "deadline",
                FlashcardAiSuggestResponse.builder()
                        .englishWord("deadline")
                        .meaningVi("hạn chót")
                        .pronunciation("/ˈded.laɪn/")
                        .exampleSentence("Please submit the report before the deadline.")
                        .source("OPENAI_BATCH")
                        .build()
        ));
        when(flashcardRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(flashcardMapper.toResponseList(anyList())).thenAnswer(inv -> {
            List<Flashcard> saved = inv.getArgument(0);
            return saved.stream().map(card -> {
                FlashcardResponse res = new FlashcardResponse();
                res.setEnglishWord(card.getEnglishWord());
                res.setMeaningVi(card.getMeaningVi());
                res.setPronunciation(card.getPronunciation());
                res.setExampleSentence(card.getExampleSentence());
                res.setModuleId(33L);
                res.setActive(card.getActive());
                return res;
            }).toList();
        });

        FlashcardImportService service = new FlashcardImportService(
                flashcardRepository,
                learningModuleRepository,
                flashcardMapper,
                parser,
                smartDictionaryService
        );

        String csv = "\uFEFFEnglish word,Meaning VI,Pronunciation,Example sentence\nnegotiate,đàm phán,/nɪˈɡoʊ.ʃi.eɪt/,Old\ndeadline,,,\n";
        MockMultipartFile file = new MockMultipartFile(
                "file",
                "words.csv",
                "text/csv",
                csv.getBytes(StandardCharsets.UTF_8)
        );

        FlashcardImportResponse result = service.importFromFile(33L, file, true, true);
        assertEquals(2, result.getTotalParsed());
        assertEquals(1, result.getSkippedDuplicateCount());
        assertEquals(1, result.getImportedCount());
        assertEquals(1, result.getAiEnrichedCount());
        assertEquals("deadline", result.getItems().get(0).getEnglishWord());
        assertEquals("hạn chót", result.getItems().get(0).getMeaningVi());
        assertEquals("/ˈded.laɪn/", result.getItems().get(0).getPronunciation());
    }

    @Test
    void suggestFlashcardUsesLocalVocabularyCatalogWhenComplete() {
        Vocabulary vocab = new Vocabulary();
        vocab.setId(9L);
        vocab.setWord("agenda");
        vocab.setMeaningVi("chương trình nghị sự");
        vocab.setIpa("/əˈdʒen.də/");
        vocab.setExampleSentence("The budget review is the first item on today's agenda.");

        when(vocabularyRepository.findByWordIgnoreCaseOrderByIdAsc("agenda")).thenReturn(List.of(vocab));

        SmartDictionaryService dictService = new SmartDictionaryService(
                vocabularyRepository,
                dictionaryCacheEntryRepository,
                userDictionaryHistoryRepository,
                userRepository,
                new ObjectMapper()
        );

        FlashcardAiSuggestResponse suggestion = dictService.suggestFlashcard("agenda");
        assertNotNull(suggestion);
        assertEquals("agenda", suggestion.getEnglishWord());
        assertEquals("chương trình nghị sự", suggestion.getMeaningVi());
        assertEquals("/əˈdʒen.də/", suggestion.getPronunciation());
        assertEquals("The budget review is the first item on today's agenda.", suggestion.getExampleSentence());
        assertEquals("LOCAL_CATALOG", suggestion.getSource());
    }
}
