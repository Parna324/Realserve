import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, label, id, ...props }, ref) => {
  const inputId = id ?? props.name;

  return (
    <label className="block text-sm font-medium text-[#ECEEF3]" htmlFor={inputId}>
      {label}
      <input
        id={inputId}
        className={cn(
          "mt-2 h-11 w-full rounded-md border border-[#232838] bg-[#0B0D12] px-3 text-sm text-[#ECEEF3] outline-none transition duration-200 placeholder:text-[#4C5263] focus:border-[#F2994A] focus:shadow-[0_0_0_1px_rgba(242,153,74,0.22)]",
          className
        )}
        ref={ref}
        {...props}
      />
    </label>
  );
});
Input.displayName = "Input";

export { Input };
