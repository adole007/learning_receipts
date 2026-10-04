import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
export const createId = customAlphabet(alphabet, 21);
export const createSlug = customAlphabet(alphabet, 10);
