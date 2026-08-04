import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseCharacterPackage } from "./character-package";

const manifest = (emotions = [{ id: "neutral", name: "Neutral", emoji: "😐" }]) =>
  strToU8(
    JSON.stringify({
      format: "edituber-character",
      version: 1,
      id: "capibara",
      name: "Capibara Gamer",
      emotions,
    }),
  );
const image = strToU8("not-rendered-in-this-unit-test");

describe("character ZIP packages", () => {
  it("imports a complete four-image emotion from a rooted package", () => {
    const archive = zipSync({
      "capibara/personaje.json": manifest(),
      "capibara/neutral/1-base.png": image,
      "capibara/neutral/2-habla.png": image,
      "capibara/neutral/3-parpadeo.png": image,
      "capibara/neutral/4-parpadeo-habla.png": image,
    });

    const result = parseCharacterPackage(archive, "2026-08-04T00:00:00.000Z");

    expect(result).toMatchObject({ id: "capibara", name: "Capibara Gamer" });
    expect(result.avatar.states[0]?.images.eyesClosed?.mouthOpen).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("accepts the simple and mouth-only modes", () => {
    const archive = zipSync({
      "personaje.json": manifest([
        { id: "neutral", name: "Neutral", emoji: "😐" },
        { id: "feliz", name: "Feliz", emoji: "🙂" },
      ]),
      "neutral/1-base.webp": image,
      "feliz/1-base.svg": image,
      "feliz/2-habla.svg": image,
    });

    const result = parseCharacterPackage(archive);

    expect(result.avatar.states[0]?.images.eyesOpen.mouthOpen).toBeUndefined();
    expect(result.avatar.states[1]?.images.eyesOpen.mouthOpen).toMatch(
      /^data:image\/svg\+xml;base64,/,
    );
  });

  it("keeps equally sized emotion directory names separate", () => {
    const archive = zipSync({
      "capibara/personaje.json": manifest([
        { id: "neutral", name: "Neutral", emoji: "😐" },
        { id: "enojado", name: "Enojado", emoji: "😠" },
      ]),
      "capibara/neutral/1-base.png": image,
      "capibara/neutral/2-habla.png": image,
      "capibara/neutral/3-parpadeo.png": image,
      "capibara/neutral/4-parpadeo-habla.png": image,
      "capibara/enojado/1-base.png": image,
      "capibara/enojado/2-habla.png": image,
      "capibara/enojado/3-parpadeo.png": image,
      "capibara/enojado/4-parpadeo-habla.png": image,
    });

    const result = parseCharacterPackage(archive);

    expect(result.avatar.states.map((state) => state.name)).toEqual(["Neutral", "Enojado"]);
  });

  it("rejects incomplete emotions instead of guessing", () => {
    const archive = zipSync({
      "personaje.json": manifest(),
      "neutral/1-base.png": image,
      "neutral/2-habla.png": image,
      "neutral/3-parpadeo.png": image,
    });

    expect(() => parseCharacterPackage(archive)).toThrow("solo admite 1, 2 o 4");
  });

  it("rejects unsafe paths before extracting package contents", () => {
    const archive = zipSync({
      "../personaje.json": manifest(),
      "../neutral/1-base.png": image,
    });

    expect(() => parseCharacterPackage(archive)).toThrow("Ruta insegura");
  });

  it("rejects repeated emotion identifiers", () => {
    const archive = zipSync({
      "personaje.json": manifest([
        { id: "neutral", name: "Neutral", emoji: "😐" },
        { id: "neutral", name: "Neutral alterno", emoji: "🙂" },
      ]),
      "neutral/1-base.png": image,
    });

    expect(() => parseCharacterPackage(archive)).toThrow(
      "Los identificadores de emoción no pueden repetirse",
    );
  });
});
