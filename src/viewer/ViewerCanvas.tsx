import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { ColorableModel } from './ColorableModel';
import { useAppStore } from '../store/useAppStore';

export function ViewerCanvas() {
  const selectFilament = useAppStore((s) => s.selectFilament);

  return (
    <Canvas
      camera={{ position: [0, 2, 5], fov: 50 }}
      onPointerMissed={() => selectFilament(null)}
      gl={{ preserveDrawingBuffer: true }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <Environment preset="studio" />
      <ContactShadows position={[0, -1.5, 0]} opacity={0.4} scale={10} blur={2} />
      <OrbitControls enableDamping dampingFactor={0.1} />
      <ColorableModel />
    </Canvas>
  );
}
