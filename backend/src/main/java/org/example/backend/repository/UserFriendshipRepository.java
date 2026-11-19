package org.example.backend.repository;

import org.example.backend.entity.UserFriendship;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserFriendshipRepository extends JpaRepository<UserFriendship, Long> {

    @Query("""
            select f from UserFriendship f
            join fetch f.requester
            join fetch f.addressee
            where f.requester.id = :userId or f.addressee.id = :userId
            order by f.updatedAt desc
            """)
    List<UserFriendship> findAllForUser(@Param("userId") Long userId);

    @Query("""
            select f from UserFriendship f
            where (f.requester.id = :u1 and f.addressee.id = :u2)
               or (f.requester.id = :u2 and f.addressee.id = :u1)
            """)
    List<UserFriendship> findBetweenUsers(@Param("u1") Long u1, @Param("u2") Long u2);

    Optional<UserFriendship> findByRequesterIdAndAddresseeId(Long requesterId, Long addresseeId);
}
