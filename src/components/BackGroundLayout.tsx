interface BackgroundLayoutProps {
  children: React.ReactNode;
}

const BackgroundLayout = ({ children }: BackgroundLayoutProps) => {
  return (
    <div
      className="
        app-background
        min-w-screen
        bg-[url('/TLApp.jpeg')]
        bg-cover
        bg-center
        bg-no-repeat
        bg-fixed

        md:bg-none
        md:bg-black
      "
    >
      {children}
    </div>
  );
};

export default BackgroundLayout;
