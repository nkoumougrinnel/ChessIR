import { Composition } from 'remotion'
import { DURATION, FPS, Presentation } from './Presentation'

export function Root() {
  return <Composition id="Presentation" component={Presentation} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} />
}
