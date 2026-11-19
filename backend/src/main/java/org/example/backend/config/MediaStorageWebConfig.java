package org.example.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

@Configuration
public class MediaStorageWebConfig implements WebMvcConfigurer {

    @Value("${toeic.storage-dir:./data}")
    private String storageDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String resolvedRoot = (storageDir == null || storageDir.isBlank()) ? "./data" : storageDir.trim();
        Path videoDir = Paths.get(resolvedRoot)
                .toAbsolutePath()
                .normalize()
                .resolve("uploads")
                .resolve("videos");
        String videoLocation = videoDir.toUri().toString();
        if (!videoLocation.endsWith("/")) {
            videoLocation = videoLocation + "/";
        }

        Path avatarDir = Paths.get(resolvedRoot)
                .toAbsolutePath()
                .normalize()
                .resolve("uploads")
                .resolve("avatars");
        String avatarLocation = avatarDir.toUri().toString();
        if (!avatarLocation.endsWith("/")) {
            avatarLocation = avatarLocation + "/";
        }

        registry.addResourceHandler("/media/videos/**")
                .addResourceLocations(videoLocation)
                .setCacheControl(CacheControl.maxAge(7, TimeUnit.DAYS).cachePublic());
        registry.addResourceHandler("/media/avatars/**")
                .addResourceLocations(avatarLocation)
                .setCacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic());
    }

    @Override
    public void configureContentNegotiation(ContentNegotiationConfigurer configurer) {
        configurer.mediaType("mov", MediaType.valueOf("video/quicktime"));
        configurer.mediaType("mp4", MediaType.valueOf("video/mp4"));
        configurer.mediaType("m4v", MediaType.valueOf("video/x-m4v"));
        configurer.mediaType("webm", MediaType.valueOf("video/webm"));
        configurer.mediaType("mkv", MediaType.valueOf("video/x-matroska"));
        configurer.mediaType("avi", MediaType.valueOf("video/x-msvideo"));
    }
}
