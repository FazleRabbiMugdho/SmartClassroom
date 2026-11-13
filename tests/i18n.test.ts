import { describe, it, expect } from "vitest";
import { labelsFor, t, locales } from "@/i18n/dictionaries";

describe("i18n", () => {
  it("every English key exists in Bangla (no untranslated labels)", () => {
    for (const prefix of ["nav", "room", "att", "auth", "audit", "shell", "header", "role", "overview", "dev", "saf", "nt", "wx", "hist", "rep", "ast", "an", "vis", "mdl", "csi", "rec", "jdg"]) {
      const en = Object.keys(labelsFor("en", prefix)).sort();
      const bn = Object.keys(labelsFor("bn", prefix)).sort();
      expect(bn, prefix).toEqual(en);
    }
  });
  it("Bangla strings differ from English (actually translated)", () => {
    expect(t("bn", "att.title")).not.toBe(t("en", "att.title"));
    expect(t("bn", "room.present")).not.toBe(t("en", "room.present"));
  });
  it("falls back to the key when missing", () => expect(t("en", "no.such.key")).toBe("no.such.key"));
  it("supports exactly en and bn", () => expect([...locales]).toEqual(["en", "bn"]));
});
