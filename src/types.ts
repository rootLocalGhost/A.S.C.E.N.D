export interface DebloatItem {
  id: string;
  name?: string;
  list?: string;
  description?: string;
  safety?: string;
  removal?: string;
  dependencies?: string[];
  neededBy?: string[];
  labels?: string[];
}

export interface AppState {
  currentDevice: string | null;
  currentDeviceList: string[];
  isBusy: boolean;
  activeTab: string;
  isSidebarCollapsed: boolean;
  debloatDB: Record<string, DebloatItem>;
  currentAppFilter: "all" | "user" | "system";
  currentDevicePath: string;
  fileViewMode: "list" | "icon";
  devToggles: {
    layout: boolean;
    overdraw: boolean;
    pointer: boolean;
  };
  logs: Array<{ time: string; type: "INFO" | "ERROR" | "SUCCESS" | "CMD"; message: string }>;
}
