import { describe, expect, it, vi } from "vitest";
import { downsample, encodeWav, missingSegments, pickProfessor, startLecture } from "./media";

describe("media", () => {
  it("encodeWav writes a 44-byte header with rate 16000 and the right length", async () => {
    const wav = encodeWav(new Float32Array([0, 1, -1, 0.5]), 16000);
    const v = new DataView(await wav.arrayBuffer());
    expect(wav.type).toBe("audio/wav");
    expect(v.byteLength).toBe(44 + 8);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(36 + 8);
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(16000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(8);
    expect([v.getInt16(44, true), v.getInt16(46, true), v.getInt16(48, true)]).toEqual([0, 32767, -32768]);
  });

  it("downsample 48000 to 16000 keeps a third of the samples, averaged", () => {
    const out = downsample(new Float32Array([1, 1, 1, 0, 0, 0.3]), 48000, 16000);
    expect(Array.from(out).map((x) => +x.toFixed(3))).toEqual([1, 0.1]);
    expect(downsample(new Float32Array(44100), 44100, 16000).length).toBe(16000);
  });

  it("missingSegments finds gaps", () => {
    expect(missingSegments([0, 2, 5], 6)).toEqual([1, 3, 4]);
    expect(missingSegments([], 2)).toEqual([0, 1]);
    expect(missingSegments([0, 1], 2)).toEqual([]);
  });

  it("startLecture asks for consent on 409, then retries create with consent", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "consent" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "L1", number: 3 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const ask = vi.fn().mockResolvedValue(true);
    expect(await startLecture("C1", ask)).toEqual({ id: "L1", number: 3 });
    expect(ask).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ lectureCourseId: "C1", source: "phone" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ lectureCourseId: "C1", source: "phone", consent: true });
    vi.unstubAllGlobals();
  });

  it("startLecture returns null when consent is declined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "consent" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await startLecture("C1", async () => false)).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  describe("pickProfessor", () => {
    const board = { x: 0.04, y: 0.08, w: 0.78, h: 0.6 }; // bottom edge at 0.68
    const prof = { x: 0.3, y: 0.2, w: 0.1, h: 0.6 }; // standing at the board
    const student = { x: 0.4, y: 0.7, w: 0.08, h: 0.25 }; // a front-row head and shoulders, seen from the back

    it("keeps the professor who steps beside the board over a student in front of it", () => {
      const beside = { ...prof, x: 0.85 };
      expect(pickProfessor([student, beside], board, null)).toBe(beside);
    });
    it("outlines nobody when only students are in view", () => {
      expect(pickProfessor([student, { ...student, x: 0.6, y: 0.64 }], board, null)).toBeNull();
    });
    it("takes the tallest standing person first", () => {
      const short = { x: 0.6, y: 0.15, w: 0.06, h: 0.2 };
      expect(pickProfessor([short, prof], board, null)).toBe(prof);
    });
    it("does not stay locked on a student who was picked while the professor was away", () => {
      const aisle = { x: 0.7, y: 0.3, w: 0.06, h: 0.3 }; // the last pick, a student who stood up, has sat down; the professor is back
      expect(pickProfessor([prof], board, aisle)).toBe(prof);
      expect(pickProfessor([prof, { ...aisle, x: 0.68 }], board, aisle)).toBe(prof); // the student is still up, nearest the last pick
    });
    it("stays with the person nearest the last pick", () => {
      const tall = { x: 0.6, y: 0.1, w: 0.1, h: 0.7 };
      expect(pickProfessor([tall, prof], board, { ...prof, x: 0.32 })).toBe(prof);
    });
  });
});
