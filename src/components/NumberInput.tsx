import { useCallback, useEffect, useState, type FocusEvent } from "react";

/** Props for `NumberInput` (a controlled numeric input with optional normalization). */
type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onValueChange: (next: number) => void;
  normalize?: (value: number) => number;
};

/**
 * Controlled numeric input that edits as a string and commits on blur.
 *
 * This prevents partial inputs (like `-` or `.`) from immediately invalidating
 * the controlled value, while still enforcing numeric output when committing.
 */
export default function NumberInput({
  value,
  onValueChange,
  normalize,
  onBlur,
  ...rest
}: NumberInputProps) {
  const [inputValue, setInputValue] = useState(String(value));
  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const commitValue = useCallback(
    (event?: FocusEvent<HTMLInputElement>) => {
      const parsed = Number(inputValue);
      if (!Number.isFinite(parsed)) {
        setInputValue(String(value));
        if (event) {
          onBlur?.(event);
        }
        return;
      }
      const normalizedValue = normalize ? normalize(parsed) : parsed;
      onValueChange(normalizedValue);
      if (event) {
        onBlur?.(event);
      }
    },
    [inputValue, normalize, onValueChange, onBlur, value],
  );

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    commitValue(event);
  };

  return (
    <input
      {...rest}
      type="number"
      value={inputValue}
      onChange={(event) => {
        setInputValue(event.target.value);
      }}
      onBlur={handleBlur}
    />
  );
}
