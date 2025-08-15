import React, { useState, useEffect } from "react";
import { AppLayout, SplitPanel } from "@cloudscape-design/components";
import Main from "../../Main";
import "@cloudscape-design/global-styles/index.css";
import { useSplitPanel } from "../../SplitPanelContext";
import { useLocation } from "react-router-dom";
import Agent from "../../pages/Agent/Agent"

const appLayoutLabels = {
  navigation: "Side navigation",
  navigationToggle: "Open side navigation",
  navigationClose: "Close side navigation",
};

function AppLayoutMFE({ user }) {
  const [navOpen, setNavOpen] = useState(true);
  const { splitPanelOpen, setSplitPanelOpen, splitPanelContext } = useSplitPanel();
  const location = useLocation();

  useEffect(() => {
    setSplitPanelOpen(false);
  }, [location.pathname, setSplitPanelOpen]);

  const RenderSplitPanelContent = () => {
    if (splitPanelContext?.content) {
      return splitPanelContext.content;
    } else {
      return <></>;
    }
  };

  const items = [
    {
      ariaLabels: {
        closeButton: "Close",
        drawerName: "Assistant",
        triggerButton: "Open Assistant",
        resizeHandle: "Resize Assistant",
      },
      resizable: true,
      defaultSize: 650,
      content: (
        <div
        style={{
          overflowY: "auto",
          minWidth: "600",
          paddingLeft: "10px",
          paddingTop: "20px",
          paddingRight: "24px",
          paddingBottom: "0px",
        }}
      >
            <Agent user={user} inTools={true}/>
          </div>
      ),
      id: "Assistant",
      trigger: {
        iconName: "gen-ai",
      },
    },
  ];

  return (
    <div>
      {user && (
        <AppLayout
          disableContentPaddings={false}
          splitPanelOpen={splitPanelOpen}
          splitPanelPreferences={{ position: "side" }}
          onSplitPanelToggle={(event) => setSplitPanelOpen(event.detail.open)}
          drawers={!splitPanelOpen ? items : []}
          splitPanel={
            <SplitPanel
              hidePreferencesButton={true}
              closeBehavior={"hide"}
              header={splitPanelContext?.context || "Details"}
            >
              {<RenderSplitPanelContent />}
            </SplitPanel>
          }
          content={<Main user={user} />}
          navigationHide={true}
          toolsHide
          headerSelector={"#h"}
          ariaLabels={appLayoutLabels}
          navigationOpen={navOpen}
          onNavigationChange={() => setNavOpen(!navOpen)}
        />
      )}
    </div>
  );
}

export default AppLayoutMFE;
