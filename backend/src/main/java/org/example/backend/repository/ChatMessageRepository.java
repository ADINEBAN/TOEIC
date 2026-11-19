package org.example.backend.repository;

import org.example.backend.entity.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    @Query("""
            select m from ChatMessage m
            left join fetch m.sender
            where m.channelType = 'COMMUNITY'
            order by m.createdAt desc, m.id desc
            """)
    List<ChatMessage> findRecentCommunityMessages(Pageable pageable);

    @Query("""
            select m from ChatMessage m
            left join fetch m.sender
            left join fetch m.recipient
            where m.channelType = 'DIRECT'
              and (
                (m.sender.id = :u1 and m.recipient.id = :u2)
                or (m.sender.id = :u2 and m.recipient.id = :u1)
              )
            order by m.createdAt desc, m.id desc
            """)
    List<ChatMessage> findRecentDirectMessages(
            @Param("u1") Long userId1,
            @Param("u2") Long userId2,
            Pageable pageable
    );

    long countBySenderId(Long senderId);
}
