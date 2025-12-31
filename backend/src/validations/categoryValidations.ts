import { z } from 'zod';
import { sanitizeText } from '../utils/sanitize.js';

// Validate Create Category
export const validateCreateCategory = z.object({
  title: z.preprocess(sanitizeText, z.string().trim().min(1, 'Title is required').describe('Title')),
});
