import { ShaderProgram } from "../../../index.js";
import createContext from "../../../../../Specs/createContext.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Renderer/SceneGISShaderPreparation", function () {
  let context;
  let command;

  beforeEach(function () {
    context = createContext();
    command = context.createViewportQuadCommand(
      "void main() { out_FragColor = vec4(0.0, 1.0, 0.0, 1.0); }",
    );
  });

  afterEach(function () {
    command.shaderProgram.destroy();
    context.destroyForSpecs();
  });

  function holdCompletion() {
    const gl = context._gl;
    const extension = gl.getExtension("KHR_parallel_shader_compile");
    if (!extension) {
      pending("KHR_parallel_shader_compile is unavailable");
    }
    const getParameter = gl.getProgramParameter.bind(gl);
    let held = true;
    const query = spyOn(gl, "getProgramParameter").and.callFake(
      function (program, name) {
        if (name === extension.COMPLETION_STATUS_KHR && held) {
          return false;
        }
        return getParameter(program, name);
      },
    );
    return {
      query,
      release: () => {
        held = false;
      },
    };
  }

  it("polls without link or reflection queries, then draws the compiled program", async function () {
    const gl = context._gl;
    const completion = holdCompletion();
    const compile = spyOn(gl, "compileShader").and.callThrough();
    const link = spyOn(gl, "linkProgram").and.callThrough();
    const program = command.shaderProgram;
    expect(program._prepare()).toBe(false);
    expect(program._prepare()).toBe(false);
    expect(compile.calls.count()).toBe(2);
    expect(link.calls.count()).toBe(1);
    expect(
      completion.query.calls
        .allArgs()
        .some(
          (args) =>
            args[1] === gl.LINK_STATUS || args[1] === gl.ACTIVE_UNIFORMS,
        ),
    ).toBe(false);
    expect(program._program).toBeUndefined();
    completion.release();
    await pollToPromise(() => program._prepare());
    expect(program._pendingLink).toBeUndefined();
    command.execute(context);
    expect(Array.from(context.readPixels())).toEqual([0, 255, 0, 255]);
    expect(program._prepare()).toBe(true);
    expect(link.calls.count()).toBe(1);
  });

  it("preserves the current draw binding while another program finishes preparation", async function () {
    command.execute(context);
    const other = context.createViewportQuadCommand(
      "void main() { out_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }",
    );
    try {
      await pollToPromise(() => other.shaderProgram._prepare());
      expect(context._gl.getParameter(context._gl.CURRENT_PROGRAM)).toBe(
        command.shaderProgram._program,
      );
      command.execute(context);
      expect(Array.from(context.readPixels())).toEqual([0, 255, 0, 255]);
    } finally {
      other.shaderProgram.destroy();
    }
  });

  it("shares a pending cache entry and lets a synchronous bind finish it once", function () {
    holdCompletion();
    const program = command.shaderProgram;
    const create = spyOn(context._gl, "createProgram").and.callThrough();
    expect(program._prepare()).toBe(false);
    const shared = ShaderProgram.fromCache({
      context,
      vertexShaderSource: program.vertexShaderSource,
      fragmentShaderSource: program.fragmentShaderSource,
      attributeLocations: program._attributeLocations,
    });
    expect(shared).toBe(program);
    shared._bind();
    shared.destroy();
    context.shaderCache.destroyReleasedShaderPrograms();
    expect(program.isDestroyed()).toBe(false);
    expect(program._pendingLink).toBeUndefined();
    expect(program._prepare()).toBe(true);
    expect(create.calls.count()).toBe(1);
  });

  it("reclaims pending shaders and programs through cache release without querying status", function () {
    const completion = holdCompletion();
    const gl = context._gl;
    const program = command.shaderProgram;
    program._prepare();
    const pendingLink = program._pendingLink;
    const deleteShader = spyOn(gl, "deleteShader").and.callThrough();
    const deleteProgram = spyOn(gl, "deleteProgram").and.callThrough();
    completion.query.calls.reset();
    program.destroy();
    context.shaderCache.destroyReleasedShaderPrograms();
    expect(program.isDestroyed()).toBe(true);
    expect(deleteShader.calls.count()).toBe(2);
    expect(
      deleteProgram.calls
        .allArgs()
        .filter((args) => args[0] === pendingLink.program).length,
    ).toBe(1);
    expect(completion.query).not.toHaveBeenCalled();
    // The command no longer owns a cache reference after the explicit release.
    command.shaderProgram = { destroy() {} };
  });

  it("uses synchronous initialization when the extension is absent", function () {
    const gl = context._gl;
    const getExtension = gl.getExtension.bind(gl);
    spyOn(gl, "getExtension").and.callFake((name) =>
      name === "KHR_parallel_shader_compile" ? null : getExtension(name),
    );
    expect(command.shaderProgram._prepare()).toBe(true);
    expect(command.shaderProgram._pendingLink).toBeUndefined();
    command.execute(context);
    expect(Array.from(context.readPixels())).toEqual([0, 255, 0, 255]);
  });

  it("reports deferred link failure once and deletes pending handles", async function () {
    const completion = holdCompletion();
    command.shaderProgram.destroy();
    command = context.createViewportQuadCommand(
      "void main() { invalid_shader; }",
    );
    const program = command.shaderProgram;
    const deleteProgram = spyOn(context._gl, "deleteProgram").and.callThrough();
    spyOn(console, "error");
    expect(program._prepare()).toBe(false);
    const pendingLink = program._pendingLink;
    completion.release();
    let error;
    await pollToPromise(function () {
      try {
        program._prepare();
      } catch (caught) {
        error = caught;
      }
      return !!error;
    });
    expect(error.message).toContain("failed to compile");
    expect(program._pendingLink).toBeUndefined();
    program.destroy();
    context.shaderCache.destroyReleasedShaderPrograms();
    expect(
      deleteProgram.calls
        .allArgs()
        .filter((args) => args[0] === pendingLink.program).length,
    ).toBe(1);
    command.shaderProgram = { destroy() {} };
  });
});
