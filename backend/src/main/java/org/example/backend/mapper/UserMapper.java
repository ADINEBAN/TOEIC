package org.example.backend.mapper;
import org.mapstruct.AfterMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.example.backend.entity.User;
import org.example.backend.dto.response.UserResponse;
import org.example.backend.util.LevelCalculator;
import java.util.List;
import java.util.Locale;

@Mapper(componentModel = "spring")
public interface UserMapper {
    @Mapping(target = "profileId", source = "profile.id")
    @Mapping(target = "level", ignore = true)
    @Mapping(target = "currentLevelMinXp", ignore = true)
    @Mapping(target = "nextLevelXp", ignore = true)
    @Mapping(target = "levelProgressPercent", ignore = true)
    @Mapping(target = "levelTitle", ignore = true)
    UserResponse toResponse(User entity);
    List<UserResponse> toResponseList(List<User> entities);

    @AfterMapping
    default void populateComputedFields(User entity, @MappingTarget UserResponse target) {
        if (entity == null || target == null) {
            return;
        }
        int xp = entity.getLearningXp() != null ? entity.getLearningXp() : 0;
        LevelCalculator.LevelProgress lp = LevelCalculator.fromXp(xp);
        target.setLearningXp(lp.totalXp());
        target.setTotalStudyMinutes(entity.getTotalStudyMinutes() != null ? entity.getTotalStudyMinutes() : 0);
        target.setLevel(lp.level());
        target.setCurrentLevelMinXp(lp.currentLevelMinXp());
        target.setNextLevelXp(lp.nextLevelXp());
        target.setLevelProgressPercent(lp.progressPercent());
        target.setLevelTitle(lp.levelTitle());
        if (target.getUsername() == null || target.getUsername().isBlank()) {
            String raw = entity.getEmail() != null ? entity.getEmail().split("@")[0] : "learner";
            String clean = raw.replaceAll("[^a-zA-Z0-9._]", "_").toLowerCase(Locale.ROOT);
            if (clean.length() < 3) {
                clean = "toeic_" + clean;
            }
            if (entity.getId() != null) {
                target.setUsername(clean + "_" + entity.getId());
            } else {
                target.setUsername(clean);
            }
        }
    }
}
