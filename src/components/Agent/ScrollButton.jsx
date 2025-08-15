import React from "react";
import Button from "@cloudscape-design/components/button";

export const ScrollButton = React.memo(({ onClick, direction }) => (
  <Button
    iconName={direction === "top" ? "angle-up" : "angle-down"}
    variant="primary"
    onClick={onClick}
  />
));
