import { useState } from "react";
import { Input } from "./FormField";

/** Password field with a show/hide toggle. `id` becomes data-field, so
 *  focusFirstError() can land on it; the element id comes from the Field. */
export default function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        data-field={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        className="focus-ring absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-500 hover:text-brand-600"
      >
        <i className={`ti ${visible ? "ti-eye-off" : "ti-eye"}`} aria-hidden="true" />
      </button>
    </div>
  );
}
