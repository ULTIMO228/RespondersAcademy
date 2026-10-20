/* Зависимости экрана «Рейтинг обучающихся» за интерфейсом (в тестах подменяются целиком). */
import { getStudentRating } from "@/shared/api";
import type { StudentRatingQuery, StudentRatingResponse } from "@/shared/api";

export type RatingApi = {
  rating: (query: StudentRatingQuery, signal?: AbortSignal) => Promise<StudentRatingResponse>;
};

export const ratingApi: RatingApi = {
  rating: (query, signal) => getStudentRating(query, signal),
};
