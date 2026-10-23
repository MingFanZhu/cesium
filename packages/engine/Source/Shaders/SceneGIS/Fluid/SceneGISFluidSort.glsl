uniform bool u_buildKeys;
uniform ivec2 u_sort;
void main() {
    int id = fluidIndex();
    if (u_buildKeys) {
        vec4 p = fluidRead(u_position, id);
        int key = p.w > 0.0 ? fluidKey(fluidCell(p.xyz)) : int(u_cells.x * u_cells.y * u_cells.z);
        out_FragColor = vec4(float(key), float(id), 0.0, 0.0);
        return;
    }
    vec4 a = fluidRead(u_sorted, id);
    vec4 b = fluidRead(u_sorted, id ^ u_sort.x);
    bool less = a.x < b.x || (a.x == b.x && a.y < b.y);
    bool low = ((id & u_sort.y) == 0) == ((id & u_sort.x) == 0);
    out_FragColor = less == low ? a : b;
}
