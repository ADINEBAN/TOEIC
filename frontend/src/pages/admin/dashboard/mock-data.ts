import { AdminCourse, AdminLessonWord, AdminSidebarItem } from '@/src/types/admin';

export const adminSidebarItems: AdminSidebarItem[] = [
  { id: 'paths', icon: 'map-outline', label: 'Lộ trình & Mục tiêu' },
  { id: 'content', icon: 'document-text-outline', label: 'Nội dung Mô-đun' },
  { id: 'grammars', icon: 'book-outline', label: 'Ngữ pháp TOEIC' },
  { id: 'video-library', icon: 'videocam-outline', label: 'Thư viện Video AI' },
  { id: 'questions', icon: 'help-circle-outline', label: 'Ngân hàng câu hỏi' },
  { id: 'tests', icon: 'list-outline', label: 'Đề thi TOEIC' },
  { id: 'users', icon: 'people-outline', label: 'Học viên & Thống kê' },
  { id: 'permissions', icon: 'key-outline', label: 'Phân quyền' },
];

export const adminCourseData: AdminCourse = {
  id: 1,
  level: 'Level 1',
  title: 'Basic English',
  modules: [
    {
      id: 11,
      title: 'Module 1: Greetings',
      type: 'module',
      lessons: [
        { id: 101, title: 'Lesson 1: Hello & Goodbye', type: 'lesson' },
        { id: 102, title: 'Lesson 2: Introductions', type: 'lesson' },
        { id: 103, title: 'Lesson 3: Communication', type: 'lesson' },
        { id: 104, title: 'Lesson 4: Film English', type: 'lesson' },
      ],
    },
  ],
};

export const adminVocabularyData: AdminLessonWord[] = [
  {
    id: 1,
    audio: 'audio-1',
    pronunciation: "/həˈləʊ/",
    status: 'Published',
    translation: 'Xin chào',
    word: 'Hello',
  },
  {
    id: 2,
    audio: 'audio-2',
    pronunciation: "/ɡʊdˈbaɪ/",
    status: 'Published',
    translation: 'Tạm biệt',
    word: 'Goodbye',
  },
  {
    id: 3,
    audio: 'audio-3',
    pronunciation: "/siː juː/",
    status: 'Draft',
    translation: 'Hẹn gặp lại',
    word: 'See you',
  },
];
