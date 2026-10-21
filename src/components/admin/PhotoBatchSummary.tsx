"use client";

import { Badge, Card, Text, View } from "reshaped";
import { TextLink } from "./links";
import { FILE_STATE_LABELS, type BatchItem, type FileState } from "./photo-batch";

interface Props {
  items: readonly BatchItem[];
}

/** Settled states read as outcomes; the rest are still in motion. */
const STATE_COLOR: Record<FileState, "neutral" | "primary" | "positive" | "critical"> = {
  waiting: "neutral",
  uploading: "primary",
  processing: "primary",
  done: "positive",
  failed: "critical",
};

/**
 * One row per file in the batch: its preview, its name, where it has got to,
 * and — once it is finished — either a link to its edit view or why it failed.
 *
 * The same rows serve as live progress during the run and as the summary
 * afterwards. That is deliberate: a separate end-of-run summary would be a
 * second list built from the first, and a file could go missing between them.
 * Rendering the batch itself means the report cannot omit a file that was
 * submitted, because there is nothing to omit it from.
 */
export default function PhotoBatchSummary({ items }: Props) {
  if (items.length === 0) return null;

  const single = items.length === 1;

  return (
    <View as="ul" gap={2} attributes={{ "data-testid": "batch-summary" }}>
      {items.map((item) => (
        <View
          as="li"
          key={item.key}
          attributes={{ "data-testid": "batch-item", "data-state": item.state }}
        >
          <Card padding={3}>
            <View direction={single ? "column" : "row"} gap={3} align={single ? "start" : "center"}>
              {item.previewUrl && (
                /* eslint-disable-next-line @next/next/no-img-element -- a local
                   object URL for a file not yet uploaded; next/image cannot
                   optimize it and would need remote patterns for no gain */
                <img
                  src={item.previewUrl}
                  alt={`Preview of ${item.file.name}`}
                  width={single ? 320 : 72}
                  style={{ maxWidth: "100%", height: "auto", borderRadius: "var(--rs-radius-small)" }}
                  data-testid="upload-preview"
                />
              )}
              <View gap={1} grow>
                <Text weight="medium" attributes={{ "data-testid": "batch-item-name" }}>
                  {item.file.name}
                </Text>
                <View direction="row" gap={2} align="center" wrap>
                  <Text variant="caption-1" color="neutral-faded">
                    {(item.file.size / 1024 / 1024).toFixed(1)} MB
                  </Text>
                  <Badge
                    size="small"
                    color={STATE_COLOR[item.state]}
                    attributes={{ "data-testid": "batch-item-state" }}
                  >
                    {FILE_STATE_LABELS[item.state]}
                  </Badge>
                  {item.state === "done" && item.photoId && (
                    <TextLink href={`/admin/photos/${item.photoId}`}>Edit</TextLink>
                  )}
                </View>
                {item.state === "failed" && item.error && (
                  <Text
                    variant="caption-1"
                    color="critical"
                    attributes={{ "data-testid": "batch-item-error" }}
                  >
                    {item.error}
                  </Text>
                )}
              </View>
            </View>
          </Card>
        </View>
      ))}
    </View>
  );
}
