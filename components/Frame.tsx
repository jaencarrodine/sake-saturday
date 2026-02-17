type FrameProps = {
  children: React.ReactNode;
  title?: string;
  className?: string;
};

export default function Frame({ children, title = "【 SAKE SATURDAY 酒の土曜日 】", className = "" }: FrameProps) {
  return (
    <div className={`min-h-screen w-full p-4 md:p-6 ${className}`}>
      <div className="relative border border-primary h-full min-h-[calc(100vh-2rem)] md:min-h-[calc(100vh-3rem)]">
        {/* Title on top border */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black px-4">
          <h1 className="text-xl md:text-2xl text-primary-highlight font-noto whitespace-nowrap">
            {title}
          </h1>
        </div>
        
        {/* Content */}
        <div className="p-4 md:p-8 h-full">
          {children}
        </div>
      </div>
    </div>
  );
}
