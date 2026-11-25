import { Permission } from "./permissions";
import {
  discoverRows,
  loadDiscoverSliders,
  serverRow,
  slidersOf,
} from "./sliders";
import { type DiscoverSlider, DiscoverSliderType } from "./types";

const slider = (
  type: DiscoverSliderType,
  order: number,
  enabled = true,
): DiscoverSlider =>
  ({ id: order + 1, type, order, enabled, isBuiltIn: true }) as DiscoverSlider;

// The rows Discover draws, on the phone and the TV alike: the first one is
// where the TV puts the focus, so it has to be one that shows.
describe("discoverRows", () => {
  test("keeps the rows the server enables, in its order", () => {
    const rows = discoverRows(
      [
        slider(DiscoverSliderType.POPULAR_TV, 2),
        slider(DiscoverSliderType.TRENDING, 0),
        slider(DiscoverSliderType.UPCOMING_MOVIES, 1, false),
      ],
      Permission.REQUEST,
    );
    expect(rows.map((row) => row.type)).toEqual([
      DiscoverSliderType.TRENDING,
      DiscoverSliderType.POPULAR_TV,
    ]);
  });

  test("leaves out the rows the app does not draw", () => {
    const rows = discoverRows(
      [
        slider(DiscoverSliderType.PLEX_WATCHLIST, 0),
        slider(DiscoverSliderType.TMDB_MOVIE_KEYWORD, 1),
        slider(DiscoverSliderType.TRENDING, 2),
      ],
      Permission.REQUEST,
    );
    expect(rows.map((row) => row.type)).toEqual([DiscoverSliderType.TRENDING]);
  });

  // Seerr's default Discover opens on it, and a plain user may not see it.
  test("shows recently added only to those Seerr shows it to", () => {
    const sliders = [
      slider(DiscoverSliderType.RECENTLY_ADDED, 0),
      slider(DiscoverSliderType.TRENDING, 1),
    ];
    expect(discoverRows(sliders, Permission.REQUEST)[0].type).toBe(
      DiscoverSliderType.TRENDING,
    );
    expect(discoverRows(sliders, Permission.RECENT_VIEW)[0].type).toBe(
      DiscoverSliderType.RECENTLY_ADDED,
    );
  });

  test("has no rows without sliders", () => {
    expect(discoverRows(undefined, Permission.REQUEST)).toEqual([]);
  });

  // The cache is kept on the device for a day, so a body stored before
  // slidersOf read the response still reaches a render (REACT-NATIVE-8V).
  test.each([
    ["a page", "<!DOCTYPE html><html></html>"],
    ["an empty body", ""],
    ["an object", { message: "Not found" }],
  ])("has no rows when what was cached is %s", (_name, cached) => {
    expect(discoverRows(cached, Permission.REQUEST)).toEqual([]);
  });
});

// A type the app has no code for, numbered past Seerr's own.
const UNKNOWN_TYPE = 100 as DiscoverSliderType;

const described = (over: Partial<DiscoverSlider> = {}): DiscoverSlider =>
  ({
    id: 50,
    type: UNKNOWN_TYPE,
    order: 0,
    enabled: true,
    isBuiltIn: false,
    title: "Picked for you",
    endpoint: "/api/v1/picks/for-me?kind=mixed",
    ...over,
  }) as DiscoverSlider;

// A row a fork of Seerr, or a service in front of it, adds to Discover: the
// app does not know its type, so the server says what to call it and where
// its pages are.
describe("serverRow", () => {
  test("is the title and the path under /api/v1, query kept", () => {
    expect(serverRow(described())).toEqual({
      title: "Picked for you",
      path: "/picks/for-me?kind=mixed",
    });
  });

  test("takes the default title when the row has none of its own", () => {
    expect(
      serverRow(described({ title: null, defaultTitle: " From Trakt " }))
        ?.title,
    ).toBe("From Trakt");
  });

  // There is no translated name to fall back on for a type the app does
  // not know, and a row with no name over it reads as a broken screen.
  test.each([
    ["no title", { title: null }],
    ["a blank title", { title: "   " }],
  ])("is none with %s", (_name, over) => {
    expect(serverRow(described(over))).toBeUndefined();
  });

  // The route is called with the Seerr session, which is for that API alone.
  test.each([
    ["none", undefined],
    ["a full address", "https://elsewhere.example/api/v1/picks"],
    ["a path outside the API", "/login"],
    ["the API's root alone", "/api/v1"],
    ["a path that climbs out", "/api/v1/../admin"],
    ["a path with an empty segment", "/api/v1//elsewhere.example/picks"],
    ["a path with a space", "/api/v1/picks for me"],
    ["something that is not text", 7],
  ])("is none when the endpoint is %s", (_name, endpoint) => {
    expect(
      serverRow(described({ endpoint: endpoint as string })),
    ).toBeUndefined();
  });

  // Trending stays trending, on its own route and under its translated
  // name, whatever a server sends along with it.
  test("is none for a type the app draws itself", () => {
    expect(
      serverRow(described({ type: DiscoverSliderType.TRENDING })),
    ).toBeUndefined();
  });
});

describe("discoverRows with rows the server describes", () => {
  test("keeps them, in the server's order, among its own", () => {
    const rows = discoverRows(
      [
        slider(DiscoverSliderType.TRENDING, 1),
        described({ order: 0 }),
        described({ id: 51, order: 2, title: "Because you watched Dune" }),
      ],
      Permission.REQUEST,
    );
    expect(rows.map((row) => row.title ?? row.type)).toEqual([
      "Picked for you",
      DiscoverSliderType.TRENDING,
      "Because you watched Dune",
    ]);
  });

  test("leaves out one the server turned off", () => {
    expect(
      discoverRows([described({ enabled: false })], Permission.REQUEST),
    ).toEqual([]);
  });

  test("leaves out one it could not name or reach", () => {
    expect(
      discoverRows(
        [described({ title: null }), described({ endpoint: "/login" })],
        Permission.REQUEST,
      ),
    ).toEqual([]);
  });

  // Seerr's own custom rows carry no endpoint, and stay left out.
  test("still leaves out a custom row that says nothing of where it is", () => {
    expect(
      discoverRows(
        [
          {
            ...slider(DiscoverSliderType.TMDB_MOVIE_KEYWORD, 0),
            title: "Heists",
            data: "10051",
          },
        ],
        Permission.REQUEST,
      ),
    ).toEqual([]);
  });
});

// What the server sends for its sliders, which is not always sliders: a
// proxy's login page or the web app's own page answers 200 too.
describe("slidersOf", () => {
  test("keeps the sliders of a list", () => {
    const sliders = [slider(DiscoverSliderType.TRENDING, 0)];
    expect(slidersOf(sliders)).toEqual(sliders);
  });

  test.each([
    ["a page", "<!DOCTYPE html><html></html>"],
    ["an empty body", ""],
    ["an object", { message: "Not found" }],
    ["nothing", undefined],
    ["null", null],
  ])("has no sliders in %s", (_name, body) => {
    expect(slidersOf(body)).toEqual([]);
  });

  test("leaves out what is not a slider in a list", () => {
    const trending = slider(DiscoverSliderType.TRENDING, 0);
    expect(slidersOf([null, "slider", trending, 3])).toEqual([trending]);
  });
});

describe("loadDiscoverSliders", () => {
  test("asks the server for its sliders", async () => {
    const sliders = [slider(DiscoverSliderType.TRENDING, 0)];
    expect(
      await loadDiscoverSliders({ discoverSettings: async () => sliders }),
    ).toEqual(sliders);
  });

  // The query lives on after the Seerr client is gone, signed out of from
  // the settings while a retry waits. Undefined is the one value React Query
  // refuses, as a failure reported under the query's name
  // (REACT-NATIVE-1N).
  test("has no sliders, rather than undefined, without a client", async () => {
    expect(await loadDiscoverSliders(undefined)).toEqual([]);
  });
});
