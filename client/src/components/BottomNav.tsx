
interface Tab {
  path: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { path: "/", label: "總覽", icon: "📊" },
  { path: "/fab", label: "晶圓廠", icon: "🏭" },
  { path: "/fab-floor", label: "無塵室", icon: "🔧" },
  { path: "/shop", label: "商城", icon: "🛒" },
  { path: "/tech-tree", label: "科技樹", icon: "🌳" },
  { path: "/contracts", label: "合約", icon: "📝" },
  { path: "/research", label: "研發", icon: "🔬" },
  { path: "/financials", label: "財務", icon: "💰" },
];

export const BottomNav = ({
  activeTab,
  onNavigate,
}: {
  activeTab: string;
  onNavigate: (path: string) => void;
}) => {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-darker/90 backdrop-blur-md border-t border-neonBlue/20"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-4xl mx-auto grid grid-cols-8">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.path;
          return (
            <button
              key={tab.path}
              onClick={() => onNavigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 h-16 min-h-[56px]
                          transition-colors border-t-2
                ${
                  isActive
                    ? "text-neonBlue border-neonBlue bg-neonBlue/10"
                    : "text-gray-400 border-transparent hover:text-neonBlue"
                }`}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="text-[10px] font-display tracking-wide">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
