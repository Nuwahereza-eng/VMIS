import { PHOTO_CREDITS } from "../domain/photoCredits.js";

// Attribution the Wikimedia Commons licences require, kept out of the way.
export default function PhotoCredits() {
  return (
    <details className="photo-credits">
      <summary>Photo credits</summary>
      <ul>
        {Object.entries(PHOTO_CREDITS).map(([file, c]) => (
          <li key={file}>
            <a href={c.source} target="_blank" rel="noreferrer">
              {c.title.replace(/\.[a-z]+$/i, "")}
            </a>{" "}
            by {c.author} ·{" "}
            {c.licenseUrl ? (
              <a href={c.licenseUrl} target="_blank" rel="noreferrer">
                {c.license}
              </a>
            ) : (
              c.license
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
