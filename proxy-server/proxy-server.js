import express from "express";
import { pathToFileURL } from "node:url";
import { Client } from "undici";
import zlib from "node:zlib";
import { promisify } from "node:util";

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const brotliDecompressAsync = promisify(zlib.brotliDecompress);

const app = express();
const port = Number.parseInt(process.env.PORT || "8080", 10);
const host = process.env.HOST || "0.0.0.0";

const namuClient = new Client("https://namu.wiki", {
  pipelining: 1,
  maxRedirections: 5,
  allowH2: true 
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/article", async (req, res) => {
  try {
    const title = String(req.query.title || "").trim();
    if (!title) return res.status(400).json({ error: "title required" });

    const { statusCode, headers, body } = await fetchArticle(title);

    if (statusCode !== 200) {
      return res.status(statusCode).json({ error: `namu fetch failed: ${statusCode}` });
    }

    // 스트림 데이터를 버퍼로 취합
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // 나무위키가 보낸 압축 헤더 확인
    const contentEncoding = headers["content-encoding"];
    let decompressedBuffer = buffer;

    // 명시적으로 압축 해제 수행
    try {
      if (contentEncoding === "br") {
        decompressedBuffer = await brotliDecompressAsync(buffer);
      } else if (contentEncoding === "gzip") {
        decompressedBuffer = await gunzipAsync(buffer);
      } else if (contentEncoding === "deflate") {
        decompressedBuffer = await inflateAsync(buffer);
      }
    } catch (decompressError) {
      console.error("나무위키 데이터 압축 해제 실패:", decompressError);
      // 압축 해제 실패 시 원본 버퍼 그대로 진행
    }

    // 디코딩 완료된 평문 UTF-8 텍스트 변환
    const htmlText = decompressedBuffer.toString("utf8");

    // 클라이언트 서버(3000번)로 깨끗한 평문 HTML 전달
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(htmlText);

  } catch (error) {
    res.status(502).json({ error: error.message || "proxy fetch failed" });
  }
});

export async function fetchArticle(title) {
  const path = `/w/${encodeURIComponent(title)}`;
  
  return namuClient.request({
    path: path,
    method: "GET",
    // 내부 자동 디코딩 비활성화 (우리가 직접 처리함)
    autoSelectEncoding: false, 
    headers: {
      "host": "namu.wiki",
      "connection": "keep-alive",
      "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "upgrade-insecure-requests": "1",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      // 나무위키가 지원하는 모든 압축 알고리즘 요구 명시
      "accept-encoding": "gzip, deflate, br",
      "sec-fetch-site": "none",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
    }
  });
}

export { app };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  app.listen(port, host, () => {
    console.log(`Namu proxy server listening at http://${host}:${port}`);
  });
}