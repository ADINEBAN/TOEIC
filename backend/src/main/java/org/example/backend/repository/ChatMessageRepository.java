package org.example.backend.repository;

import org.example.backend.entity.ChatMessage;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
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

    @Query("""
            select m.sender.id, count(m) from ChatMessage m
            where m.channelType = 'DIRECT'
              and m.recipient.id = :recipientId
              and m.readAt is null
              and m.sender is not null
            group by m.sender.id
            """)
    List<Object[]> countUnreadDirectBySender(@Param("recipientId") Long recipientId);

    @Modifying
    @Query("""
            update ChatMessage m set m.readAt = :readAt
            where m.channelType = 'DIRECT'
              and m.recipient.id = :recipientId
              and m.sender.id = :senderId
              and m.readAt is null
            """)
    int markDirectMessagesRead(
            @Param("recipientId") Long recipientId,
            @Param("senderId") Long senderId,
            @Param("readAt") LocalDateTime readAt
    );

    long countBySenderId(Long senderId);
}
