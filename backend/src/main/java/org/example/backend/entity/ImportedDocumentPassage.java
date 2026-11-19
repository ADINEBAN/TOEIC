package org.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "imported_document_passages")
@Getter
@Setter
public class ImportedDocumentPassage extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private ImportedDocument document;

    @Column(name = "passage_code", nullable = false, length = 80)
    private String passageCode;

    @Column(name = "part_no", nullable = false)
    private Integer partNo;

    @Column(name = "passage_type", nullable = false, length = 30)
    private String passageType;

    @Column(name = "document_kind", length = 60)
    private String documentKind;

    @Column(name = "page_number", nullable = false)
    private Integer pageNumber = 1;

    @Column(name = "content", nullable = false, columnDefinition = "LONGTEXT")
    private String content;

    @Column(name = "table_json", columnDefinition = "LONGTEXT")
    private String tableJson;

    @Column(name = "linked_passage_codes", length = 255)
    private String linkedPassageCodes;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;
}
