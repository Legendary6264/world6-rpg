import type {Scene,SceneObject} from './sceneTypes'

// Apply full footprints to new editor operations, while retaining the reader's
// compatibility with older scenes whose edge objects were only centre-checked.
export function assertEditorObjectBounds(scene:Pick<Scene,'width'|'depth'>,objects:readonly Pick<SceneObject,'x'|'y'|'width'|'depth'>[]){
 for(const o of objects)if(o.x-o.width/2< -1e-6||o.x+o.width/2>scene.width+1e-6||o.y-o.depth/2< -1e-6||o.y+o.depth/2>scene.depth+1e-6)throw Error('Проверь положение: объект целиком должен помещаться в границы сцены.')
}
