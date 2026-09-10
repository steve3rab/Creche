import { shallowRef } from 'vue';

export const confirmation = shallowRef<{ message: string; resolve: (value: boolean) => void }>();
export function askConfirmation(message: string): Promise<boolean> {
  // Repeated clicks must not leave an unresolved action behind.
  if (confirmation.value) return Promise.resolve(false);
  return new Promise((resolve) => {
    confirmation.value = { message, resolve };
  });
}
export function answerConfirmation(value: boolean) {
  const pending = confirmation.value;
  confirmation.value = undefined;
  pending?.resolve(value);
}
