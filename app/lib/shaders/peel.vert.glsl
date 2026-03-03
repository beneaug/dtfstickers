uniform float uPeel;
uniform float uPeelAngle;
uniform float uCylinderRadius;

varying vec2 vUv;
varying vec3 vNormal;
varying float vPeelFactor;
varying float vIsBacking;
varying float vAO;
varying vec3 vWorldPos;

#define PI 3.14159265359

// Rodrigues' rotation: rotate vector v around axis k by angle theta
vec3 rodrigues(vec3 v, vec3 k, float theta) {
  float ct = cos(theta);
  float st = sin(theta);
  return v * ct + cross(k, v) * st + k * dot(k, v) * (1.0 - ct);
}

void main() {
  vUv = uv;
  vIsBacking = 0.0;
  vAO = 0.0;
  vPeelFactor = 0.0;

  vec3 pos = position;
  vec3 norm = normal;

  // Peel direction vectors based on uPeelAngle
  // uPeelAngle=0 means top-right corner peels
  float ca = cos(uPeelAngle);
  float sa = sin(uPeelAngle);

  // Peel axis direction (the direction the fold line sweeps)
  vec2 peelDir = vec2(-ca - sa, ca - sa) * 0.7071; // normalized diagonal

  // Fold line normal (perpendicular to fold line, pointing into peeled region)
  vec2 foldNormal = vec2(peelDir.x, peelDir.y);

  // Fold line axis (along the fold line itself, for rotation)
  vec3 foldAxis = normalize(vec3(-peelDir.y, peelDir.x, 0.0));

  // Corner position (where peel originates)
  vec2 corner = vec2(
    (uPeelAngle < PI * 0.5 || uPeelAngle > PI * 1.5) ? 1.0 : -1.0,
    (uPeelAngle < PI) ? 1.0 : -1.0
  );

  // Fold line sweeps from corner toward center as peel increases
  // At peel=0, fold line is at the corner. At peel=1, it's past center.
  float sweepDist = uPeel * 2.2; // how far the fold line has moved from corner
  vec2 foldLinePoint = corner - foldNormal * sweepDist;

  // Signed distance from vertex to fold line
  float d = dot(pos.xy - foldLinePoint, foldNormal);

  if (d > 0.0 && uPeel > 0.001) {
    // Vertex is past the fold line — apply cylinder deformation
    float R = uCylinderRadius;
    float arcAngle = d / R;

    // Position on cylinder surface
    float along = R * sin(arcAngle);   // distance along peel direction
    float up = R * (1.0 - cos(arcAngle)); // height above sticker plane

    // Displace vertex
    pos.xy = foldLinePoint + foldNormal * along;
    pos.z += up;

    // Rotate normal around fold axis
    norm = rodrigues(norm, foldAxis, -arcAngle);

    vPeelFactor = clamp(d / (sweepDist + 0.001), 0.0, 1.0);

    // Check if vertex has curled past 180 degrees (showing backing)
    vIsBacking = step(PI, arcAngle);

    // Ambient occlusion near fold line
    vAO = exp(-d * d * 4.0) * 0.6;
  }

  vNormal = normalize(normalMatrix * norm);
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
