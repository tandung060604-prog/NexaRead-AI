import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { isPublicPath, proxy } from "./proxy";

describe("route protection proxy", () => {
  it("keeps public routes available without a session", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(proxy(new NextRequest("http://localhost/login")).status).toBe(200);
  });

  it("redirects protected routes to login with a return path", () => {
    const response = proxy(
      new NextRequest("http://localhost/documents/doc-1/read?block=2"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?returnTo=%2Fdocuments%2Fdoc-1%2Fread%3Fblock%3D2",
    );
  });

  it("allows a protected route when the opaque session cookie exists", () => {
    const request = new NextRequest("http://localhost/library", {
      headers: { cookie: "nexaread_session=opaque-token" },
    });

    expect(proxy(request).status).toBe(200);
  });
});
