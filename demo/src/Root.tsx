import { Composition } from "remotion";
import { Hero, FPS, WIDTH, HEIGHT, DURATION_FRAMES } from "./Hero";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Hero"
        component={Hero}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
