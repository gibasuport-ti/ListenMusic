import * as React from "react"
import { cn } from "@/src/lib/utils"

export interface SliderProps {
  className?: string
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  step?: number
  orientation?: "horizontal" | "vertical"
  onValueChange?: (value: number[]) => void
  onValueCommitted?: (value: number[]) => void
  disabled?: boolean
  id?: string
}

export function Slider({
  className,
  value,
  defaultValue,
  min = 0,
  max = 100,
  step = 1,
  orientation = "horizontal",
  onValueChange,
  onValueCommitted,
  disabled = false,
  id
}: SliderProps) {
  const [localValue, setLocalValue] = React.useState(
    value?.[0] ?? defaultValue?.[0] ?? min
  )

  React.useEffect(() => {
    if (value !== undefined) {
      setLocalValue(value[0])
    }
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value)
    setLocalValue(newValue)
    onValueChange?.([newValue])
  }

  const handleMouseUp = () => {
    onValueCommitted?.([localValue])
  }

  const percentage = ((localValue - min) / (max - min)) * 100

  return (
    <div
      className={cn(
        "relative flex select-none items-center justify-center group/slider",
        orientation === "horizontal" ? "w-full h-6" : "h-full w-6",
        disabled && "opacity-50 pointer-events-none",
        className
      )}
      id={id}
    >
      {/* Visual Track */}
      <div 
        className={cn(
          "absolute rounded-full bg-white/10 overflow-hidden",
          orientation === "horizontal" ? "w-full h-1.5" : "h-full w-1.5"
        )}
      >
        <div 
          className="absolute bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          style={
            orientation === "horizontal" 
              ? { width: `${percentage}%`, height: '100%', left: 0 } 
              : { height: `${percentage}%`, width: '100%', bottom: 0 }
          }
        />
      </div>

      {/* Actual Input - Hidden but functional */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={localValue}
        onChange={handleChange}
        onMouseUp={handleMouseUp}
        onTouchEnd={handleMouseUp}
        onBlur={handleMouseUp}
        className={cn(
          "absolute cursor-pointer opacity-0 z-20",
          orientation === "horizontal" ? "w-full h-full" : "w-[200px] h-6"
        )}
        style={
          orientation === "vertical" 
            ? { 
                transform: "rotate(-90deg)", 
                width: "192px", // Fixed width to cover vertical area (roughly h-48)
                position: "absolute"
              } 
            : {}
        }
      />

      {/* Visual Thumb */}
      <div 
        className={cn(
          "absolute size-4 rounded-full border border-white/40 bg-white shadow-xl pointer-events-none z-10 transition-transform group-hover/slider:scale-110",
          orientation === "horizontal" ? "translate-y-0" : "translate-x-0"
        )}
        style={
          orientation === "horizontal"
            ? { left: `calc(${percentage}% - 8px)` }
            : { bottom: `calc(${percentage}% - 8px)` }
        }
      />
    </div>
  )
}
