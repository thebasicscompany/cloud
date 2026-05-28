import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "basichome",
  version: packageJson.version,
  copyright: `© ${currentYear}, basichome.`,
  meta: {
    title: "basichome",
    description:
      "Run local-first AI work, saved automations, private apps, approvals, context, and cloud promotion from one cockpit.",
  },
};
