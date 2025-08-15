import { Thinking } from "../ThreatModeling/CustomIcons";



const AgentLogo = ({color="#FFFFFF"}) => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100%",
    }}
  >
    <Thinking width="120px" height="120px" color="#a6a6a6" />
  </div>
)

export default AgentLogo;