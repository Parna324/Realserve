import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, children, id, label, ...props }, ref) => {
  const selectId = id ?? props.name;

  return (
    <label className="block text-sm font-medium text-[#ECEEF3]" htmlFor={selectId}>
      {label}
      <select
        id={selectId}
        className={cn(
          "mt-2 h-11 w-full rounded-md border border-[#232838] bg-[#0B0D12] px-3 text-sm text-[#ECEEF3] outline-none transition duration-200 focus:border-[#F2994A] focus:shadow-[0_0_0_1px_rgba(242,153,74,0.22)]",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    </label>
  );
});
Select.displayName = "Select";

export { Select };
