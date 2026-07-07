
export interface YtSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
  };
}

export interface YtSearchListResponse {
  items: YtSearchItem[];
  // Present when YouTube truncates/limits results — not used for
  // pagination today (build spec: "take the top 20 directly, no
  // pagination needed") but kept on the type for completeness/future use.
  nextPageToken?: string;
}

export interface YtVideoListItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    // Only present if the uploader explicitly set it — most videos never
    // do. This is the "free, instant" first check in the language
    // detection flow .
    defaultAudioLanguage?: string;
    // Already returned free by `part=snippet` (no extra quota cost) —
    // just wasn't read before. Used as the second-tier, still-free
    // language signal (title+description text ID) that sits between the
    // `defaultAudioLanguage` tag and an actual transcript fetch, so most
    // videos never need to hit the fragile unofficial transcript endpoint
    // at all.
    description?: string;
  };
  statistics: {
    viewCount?: string; // YouTube returns these as strings, not numbers
    commentCount?: string; // absent entirely if comments are disabled
    // Absent if the uploader has hidden like counts — treat as 0, not an
    // error; feeds the popularity component alongside viewCount.
    likeCount?: string;
  };
  // ISO 8601 (e.g. "PT1H32M10S") — used as a second, independent signal
  // for video_scope alongside the title heuristic, since past-livestream
  // VODs (a large share of CP solution content) often carry generic
  // titles that the title pattern alone won't catch.
  contentDetails?: {
    duration?: string;
  };
}

export interface YtVideoListResponse {
  items: YtVideoListItem[];
}

export interface YtCommentThreadItem {
  snippet: {
    topLevelComment: {
      snippet: {
        textDisplay: string;
        likeCount: number;
      };
    };
  };
}

export interface YtCommentThreadListResponse {
  items: YtCommentThreadItem[];
}

/** The two quota costs this app actually incurs, per the build spec's Section 3 budget. */
export const YT_QUOTA_COST = {
  SEARCH_LIST: 100,
  VIDEOS_LIST: 1, // batched — ~1 unit total regardless of how many IDs, per the build spec
  COMMENT_THREADS_LIST: 1,
} as const;
