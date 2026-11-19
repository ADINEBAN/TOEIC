package org.example.backend.repository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.example.backend.entity.User;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
	boolean existsByEmail(String email);

	Optional<User> findByEmail(String email);

	boolean existsByUsernameIgnoreCase(String username);

	boolean existsByUsernameIgnoreCaseAndIdNot(String username, Long id);

	Optional<User> findByUsernameIgnoreCase(String username);

	List<User> findTop15ByUsernameContainingIgnoreCaseOrFullNameContainingIgnoreCase(String username, String fullName);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select u from User u where lower(u.email) = lower(:email)")
	Optional<User> findByEmailForUpdate(@Param("email") String email);

	List<User> findTop20ByOrderByArenaEloDescArenaWinsDescDiamondsDesc();
}
