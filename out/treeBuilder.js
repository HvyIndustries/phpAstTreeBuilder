/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Hvy Industries. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *  "HVY", "HVY Industries" and "Hvy Industries" are trading names of JCKD (UK) Ltd
 *--------------------------------------------------------------------------------------------*/
"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var phpParser = require("php-parser");
var TreeBuilder = (function () {
    function TreeBuilder() {
    }
    // v1.1
    // TODO -- Handle PHP written inside an HTML file (strip everything except php code)
    // Parse PHP code to generate an object tree for intellisense suggestions
    TreeBuilder.prototype.Parse = function (text, filePath) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            phpParser.parser.locations = true;
            phpParser.parser.docBlocks = true;
            var ast = phpParser.parseCode(text);
            _this.BuildObjectTree(ast, filePath).then(function (tree) {
                // TODO -- Convert this to promise
                var symbolCache = _this.BuildSymbolCache(tree, filePath);
                var returnObj = {
                    tree: tree,
                    symbolCache: symbolCache
                };
                // DEBUG
                //console.log("Built tree for file: " + filePath);
                resolve(returnObj);
            });
        });
    };
    // Convert the generated AST into a usable object tree
    TreeBuilder.prototype.BuildObjectTree = function (ast, filePath) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var tree = new FileNode();
            tree.path = filePath;
            tree.fileReferences = _this.BuildFileReferences(ast);
            tree.classes = _this.BuildClassDeclarations(ast);
            tree.constants = _this.BuildTopLevelConstantDeclarations(ast);
            tree.topLevelVariables = _this.BuildTopLevelVariableDeclarations(ast);
            tree.functions = _this.BuildTopLevelFunctionDeclarations(ast);
            tree.interfaces = _this.BuildInterfaceDeclarations(ast);
            tree.traits = _this.BuildTraitDeclarations(ast);
            resolve(tree);
        });
    };
    // Crunch through the generated tree to build a cache of symbols in this file
    TreeBuilder.prototype.BuildSymbolCache = function (tree, filePath) {
        var cache = [];
        // TODO
        return cache;
    };
    TreeBuilder.prototype.BuildFileReferences = function (ast) {
        var refs = [];
        var topLevel = ast[1];
        topLevel.forEach(function (section) {
            if (section[1] == "require" || section[1] == "require_once" || section[1] == "include" || section[1] == "include_once") {
                // TODO -- Convert PHP constants such as dirname(__DIR__) and dirname(__FILE__) to absolute paths
                // TODO -- Convert concatination to absolute paths (eg. "folder/" . "file.php")
                var path = section[2][1];
                refs.push(path);
            }
        });
        return refs;
    };
    TreeBuilder.prototype.BuildClassDeclarations = function (ast) {
        var _this = this;
        var classes = [];
        var section = ast[1];
        section.forEach(function (topLevel) {
            // Build classes
            if (topLevel[3] != null && topLevel[3][0] == "class") {
                var classNode = new ClassNode();
                classNode.startPos = _this.BuildStartLocation(topLevel[1]);
                classNode.endPos = _this.BuildEndLocation(topLevel[2]);
                classNode.name = topLevel[3][1];
                classNode.extends = topLevel[3][3][0];
                topLevel = topLevel[3];
                // Build interfaces
                if (topLevel[4] != false) {
                    for (var i = 0; i < topLevel[4].length; i++) {
                        var subElement = topLevel[4][i];
                        classNode.implements.push(subElement[0]);
                    }
                }
                if (topLevel[2] == 187) {
                    classNode.isAbstract = true;
                }
                if (topLevel[2] == 189) {
                    classNode.isFinal = true;
                }
                // Build properties
                topLevel[5].properties.forEach(function (propLevel) {
                    var propNode = new PropertyNode();
                    propNode.startPos = _this.BuildStartLocation(propLevel[1]);
                    propNode.endPos = _this.BuildEndLocation(propLevel[2]);
                    if (propLevel[4][0] == 0) {
                        propNode.accessModifier = AccessModifierNode.public;
                    }
                    if (propLevel[4][0] == 1) {
                        propNode.accessModifier = AccessModifierNode.protected;
                    }
                    if (propLevel[4][0] == 2) {
                        propNode.accessModifier = AccessModifierNode.private;
                    }
                    if (propLevel[4][1] == 1) {
                        propNode.isStatic = true;
                    }
                    propLevel = propLevel[3][0];
                    propNode.name = propLevel[3][0];
                    if (propLevel[3][1] != null) {
                        propNode.type = propLevel[3][1][0];
                    }
                    classNode.properties.push(propNode);
                });
                // Build constants
                topLevel[5].constants.forEach(function (constLevel) {
                    var constNode = new ConstantNode();
                    constNode.startPos = _this.BuildStartLocation(constLevel[1]);
                    constNode.endPos = _this.BuildEndLocation(constLevel[2]);
                    constNode.name = constLevel[3][0][3][0];
                    if (constLevel[3][0][3][1] != null) {
                        constNode.type = constLevel[3][0][3][1][0];
                    }
                    classNode.constants.push(constNode);
                });
                // Build methods
                topLevel[5].methods.forEach(function (methodLevel) {
                    // Build constructor (newstyle + oldstyle)
                    if (methodLevel[3][1] == "__construct" || methodLevel[3][1] == classNode.name) {
                        var constructorNode = new ConstructorNode();
                        constructorNode.name = methodLevel[3][1];
                        constructorNode.startPos = _this.BuildStartLocation(methodLevel[1]);
                        constructorNode.endPos = _this.BuildEndLocation(methodLevel[2]);
                        if (methodLevel[3][1] == classNode.name) {
                            constructorNode.isDeprecated = true;
                        }
                        constructorNode.params = _this.BuildFunctionParams(methodLevel[3][2]);
                        if (methodLevel[3][5] != null) {
                            methodLevel[3][5].forEach(function (codeLevel) {
                                // Build local scope variable setters
                                var scopeVar = _this.BuildFunctionScopeVariables(codeLevel);
                                if (scopeVar != null) {
                                    constructorNode.scopeVariables.push(scopeVar);
                                }
                                // Build function calls
                                var functionCalls = _this.BuildFunctionCallsToOtherFunctions(codeLevel);
                                functionCalls.forEach(function (element) {
                                    constructorNode.functionCalls.push(element);
                                });
                                // Build imported global variables
                                if (codeLevel[0] == "global") {
                                    codeLevel[1].forEach(function (importGlobalLevel) {
                                        if (importGlobalLevel[0] == "var") {
                                            constructorNode.globalVariables.push(importGlobalLevel[1]);
                                        }
                                    });
                                }
                            });
                        }
                        classNode.construct = constructorNode;
                    }
                    else {
                        var methodNode = new MethodNode();
                        methodNode.startPos = _this.BuildStartLocation(methodLevel[1]);
                        methodNode.endPos = _this.BuildEndLocation(methodLevel[2]);
                        // Build access modifier
                        if (methodLevel[4][0] == 0) {
                            methodNode.accessModifier = AccessModifierNode.public;
                        }
                        if (methodLevel[4][0] == 1) {
                            methodNode.accessModifier = AccessModifierNode.protected;
                        }
                        if (methodLevel[4][0] == 2) {
                            methodNode.accessModifier = AccessModifierNode.private;
                        }
                        methodNode.name = methodLevel[3][1];
                        // Mark static
                        if (methodLevel[4][1] == 1) {
                            methodNode.isStatic = true;
                        }
                        // Mark abstract
                        if (methodLevel[4][2] == 1) {
                            methodNode.isAbstract = true;
                        }
                        methodNode.params = _this.BuildFunctionParams(methodLevel[3][2]);
                        if (methodLevel[3][5] != null) {
                            methodLevel[3][5].forEach(function (codeLevel) {
                                // Build local scope variable setters
                                var scopeVar = _this.BuildFunctionScopeVariables(codeLevel);
                                if (scopeVar != null) {
                                    methodNode.scopeVariables.push(scopeVar);
                                }
                                // Build function calls
                                var functionCalls = _this.BuildFunctionCallsToOtherFunctions(codeLevel);
                                functionCalls.forEach(function (element) {
                                    methodNode.functionCalls.push(element);
                                });
                                // Build imported global variables
                                if (codeLevel[0] == "global") {
                                    codeLevel[1].forEach(function (importGlobalLevel) {
                                        if (importGlobalLevel[0] == "var") {
                                            methodNode.globalVariables.push(importGlobalLevel[1]);
                                        }
                                    });
                                }
                            });
                        }
                        classNode.methods.push(methodNode);
                    }
                });
                // Build Traits
                topLevel[5].use.traits.forEach(function (traitLevel) {
                    classNode.traits.push(traitLevel[0]);
                });
                classes.push(classNode);
            }
        });
        return classes;
    };
    TreeBuilder.prototype.BuildTopLevelConstantDeclarations = function (ast) {
        var constants = [];
        var topLevel = ast[1];
        topLevel.forEach(function (element) {
            if (element[0] == "const") {
                var constantNode = new ConstantNode();
                constantNode.name = element[1][0][0];
                constantNode.type = element[1][0][1][0];
                // TODO -- Build location
                constants.push(constantNode);
            }
        });
        return constants;
    };
    TreeBuilder.prototype.BuildTopLevelVariableDeclarations = function (ast) {
        var variables = [];
        var topLevel = ast[1];
        topLevel.forEach(function (element) {
            if (element[0] == "set") {
                var variableNode = new VariableNode();
                variableNode.name = element[1][1];
                variableNode.type = element[2][0];
                variables.push(variableNode);
            }
        });
        return variables;
    };
    TreeBuilder.prototype.BuildTopLevelFunctionDeclarations = function (ast) {
        var _this = this;
        var functions = [];
        var topLevel = ast[1];
        topLevel.forEach(function (element) {
            if (element[0] == "position") {
                if (element[3][0] == "function") {
                    var methodNode = new MethodNode();
                    methodNode.startPos = _this.BuildStartLocation(element[1]);
                    methodNode.endPos = _this.BuildEndLocation(element[2]);
                    methodNode.name = element[3][1];
                    methodNode.params = _this.BuildFunctionParams(element[3][2]);
                    element[3][5].forEach(function (codeLevel) {
                        // Build local scope variable setters
                        var scopeVar = _this.BuildFunctionScopeVariables(codeLevel);
                        if (scopeVar != null) {
                            methodNode.scopeVariables.push(scopeVar);
                        }
                        // Build function calls
                        var functionCalls = _this.BuildFunctionCallsToOtherFunctions(codeLevel);
                        functionCalls.forEach(function (element) {
                            methodNode.functionCalls.push(element);
                        });
                        // Build imported global variables
                        if (codeLevel[0] == "global") {
                            codeLevel[1].forEach(function (importGlobalLevel) {
                                if (importGlobalLevel[0] == "var") {
                                    methodNode.globalVariables.push(importGlobalLevel[1]);
                                }
                            });
                        }
                    });
                    functions.push(methodNode);
                }
            }
        });
        return functions;
    };
    TreeBuilder.prototype.BuildInterfaceDeclarations = function (ast) {
        var _this = this;
        var interfaces = [];
        var topLevel = ast[1];
        topLevel.forEach(function (element) {
            if (element[0] == "position") {
                if (element[3][0] == "interface") {
                    var interfaceNode = new InterfaceNode();
                    interfaceNode.name = element[3][1];
                    // Build position
                    interfaceNode.startPos = _this.BuildStartLocation(element[1]);
                    interfaceNode.endPos = _this.BuildEndLocation(element[2]);
                    element[3][3].forEach(function (extendedInterface) {
                        interfaceNode.extends.push(extendedInterface[0]);
                    });
                    // Build constants
                    element[3][4].constants.forEach(function (constant) {
                        var constantNode = new ConstantNode();
                        constantNode.name = constant[3][0][3][0];
                        constantNode.type = constant[3][0][3][1][0];
                        constantNode.startPos = _this.BuildStartLocation(constant[3][0][1]);
                        constantNode.endPos = _this.BuildEndLocation(constant[3][0][2]);
                        interfaceNode.constants.push(constantNode);
                    });
                    // Build methods
                    element[3][4].methods.forEach(function (method) {
                        var methodNode = new MethodNode();
                        methodNode.name = method[3][1];
                        methodNode.startPos = _this.BuildStartLocation(method[1]);
                        methodNode.endPos = _this.BuildEndLocation(method[2]);
                        methodNode.params = _this.BuildFunctionParams(method[3][2]);
                        // TODO -- Add return value
                        interfaceNode.methods.push(methodNode);
                    });
                    interfaces.push(interfaceNode);
                }
            }
        });
        return interfaces;
    };
    TreeBuilder.prototype.BuildTraitDeclarations = function (ast) {
        var _this = this;
        var traits = [];
        var topLevel = ast[1];
        topLevel.forEach(function (element) {
            if (element[0] == "position") {
                if (element[3][0] == "trait") {
                    var traitNode = new TraitNode();
                    traitNode.name = element[3][1];
                    // Build position
                    traitNode.startPos = _this.BuildStartLocation(element[1]);
                    traitNode.endPos = _this.BuildEndLocation(element[2]);
                    traitNode.extends = element[3][2][0];
                    element[3][4].properties.forEach(function (propLevel) {
                        var propNode = new PropertyNode();
                        propNode.startPos = _this.BuildStartLocation(propLevel[3][0][1]);
                        propNode.endPos = _this.BuildEndLocation(propLevel[3][0][2]);
                        if (propLevel[4][0] == 0) {
                            propNode.accessModifier = AccessModifierNode.public;
                        }
                        if (propLevel[4][0] == 1) {
                            propNode.accessModifier = AccessModifierNode.protected;
                        }
                        if (propLevel[4][0] == 2) {
                            propNode.accessModifier = AccessModifierNode.private;
                        }
                        if (propLevel[4][1] == 1) {
                            propNode.isStatic = true;
                        }
                        propLevel = propLevel[3][0];
                        propNode.name = propLevel[3][0];
                        if (propLevel[3][1] != null) {
                            propNode.type = propLevel[3][1][0];
                        }
                        traitNode.properties.push(propNode);
                    });
                    // Build constants
                    element[3][4].constants.forEach(function (constant) {
                        var constantNode = new ConstantNode();
                        constantNode.name = constant[3][0][3][0];
                        constantNode.type = constant[3][0][3][1][0];
                        constantNode.startPos = _this.BuildStartLocation(constant[3][0][1]);
                        constantNode.endPos = _this.BuildEndLocation(constant[3][0][2]);
                        traitNode.constants.push(constantNode);
                    });
                    // Build methods
                    element[3][4].methods.forEach(function (method) {
                        var methodNode = new MethodNode();
                        methodNode.name = method[3][1];
                        methodNode.startPos = _this.BuildStartLocation(method[1]);
                        methodNode.endPos = _this.BuildEndLocation(method[2]);
                        methodNode.params = _this.BuildFunctionParams(method[3][2]);
                        // TODO -- Abstract methods
                        methodNode.isAbstract = false;
                        traitNode.methods.push(methodNode);
                    });
                    // TODO -- Add traits used in this trait
                    element[3][4].use.traits.forEach(function (traitLevel) {
                        traitNode.traits.push(traitLevel[0]);
                    });
                    traits.push(traitNode);
                }
            }
        });
        return traits;
    };
    TreeBuilder.prototype.BuildStartLocation = function (start) {
        return new PositionInfo(start[0], start[1], start[2]);
    };
    TreeBuilder.prototype.BuildEndLocation = function (end) {
        return new PositionInfo(end[0], end[1], end[2]);
    };
    // paramsArray == methodLevel[3][2]
    TreeBuilder.prototype.BuildFunctionParams = function (paramsArray) {
        var params = [];
        if (paramsArray != null && paramsArray.length != 0) {
            // Build parameters
            paramsArray.forEach(function (paramLevel) {
                var paramNode = new ParameterNode();
                paramNode.name = paramLevel[0];
                if (paramLevel[2] != null && paramLevel[2].length != 0) {
                    paramNode.optional = true;
                    paramNode.type = paramLevel[2][0];
                }
                else {
                    paramNode.type = paramLevel[1];
                }
                params.push(paramNode);
            });
        }
        return params;
    };
    // codeLevel == codeLevel
    TreeBuilder.prototype.BuildFunctionScopeVariables = function (codeLevel) {
        if (codeLevel[0] == "set") {
            if (codeLevel[1][0] == "var") {
                var variableNode = new VariableNode();
                variableNode.name = codeLevel[1][1];
                variableNode.type = codeLevel[2][0];
                return variableNode;
            }
        }
        return null;
    };
    TreeBuilder.prototype.BuildFunctionCallsToOtherFunctions = function (codeLevel) {
        var _this = this;
        var functionCalls = [];
        // Handle cases where the function call isn't at the start of the line (eg. echo myFunc())
        if (codeLevel[0] != "call" && Array.isArray(codeLevel[2]) && Array.isArray(codeLevel[2][0]) && codeLevel[2][0].length > 0) {
            // TODO -- Handle more than one nested array
            // TODO -- Handle a function being called as a parameter
            codeLevel = codeLevel[2][0];
        }
        if (codeLevel[0] == "call") {
            var funcNode = new FunctionCallNode();
            if (codeLevel[1][0] == "ns") {
                funcNode.name = codeLevel[1][1][0];
            }
            else {
                // Set the name
                funcNode.name = codeLevel[1][codeLevel[1].length - 1][1];
                // Build parents of called function (eg. $this from $this->func(), etc)
                var parents = this.BuildParents(codeLevel[1], funcNode.name);
                if (parents != null) {
                    funcNode.parents = parents;
                }
            }
            codeLevel[2].forEach(function (funcCallLevel) {
                var paramNode = new ParameterNode();
                if (funcCallLevel.length == 2) {
                    paramNode.name = funcCallLevel[1];
                }
                else {
                    // Set the name
                    paramNode.name = funcCallLevel[funcCallLevel.length - 1][1];
                    // Build parents of provided parameters (eg. $this from $this->myProp, etc)
                    var parents = _this.BuildParents(funcCallLevel, paramNode.name);
                    if (parents != null) {
                        paramNode.parents = parents;
                    }
                }
                funcNode.params.push(paramNode);
            });
            functionCalls.push(funcNode);
        }
        return functionCalls;
    };
    // Recurse through the provided array building up an array of parents
    TreeBuilder.prototype.BuildParents = function (sourceArray, existingName) {
        var _this = this;
        var toReturn = [];
        if (Array.isArray(sourceArray)) {
            sourceArray.forEach(function (element) {
                if (Array.isArray(element)) {
                    if (element.length > 2) {
                        var results = _this.BuildParents(element, existingName);
                        results.forEach(function (subElement) {
                            toReturn.push(subElement);
                        });
                    }
                    else {
                        if (typeof element[1] == "string") {
                            if (element[1] != existingName) {
                                toReturn.push(element[1]);
                            }
                        }
                    }
                }
            });
        }
        return toReturn;
    };
    return TreeBuilder;
}());
exports.TreeBuilder = TreeBuilder;
// Entity Schema
// TODO - if/else blocks
//      - switch blocks
//      - handle autoloaded files
//      - namespaces
var BaseNode = (function () {
    function BaseNode() {
    }
    return BaseNode;
}());
var FileNode = (function () {
    function FileNode() {
        this.constants = [];
        this.topLevelVariables = [];
        this.functions = [];
        this.classes = [];
        this.interfaces = [];
        this.traits = [];
    }
    return FileNode;
}());
exports.FileNode = FileNode;
var ClassNode = (function (_super) {
    __extends(ClassNode, _super);
    function ClassNode() {
        _super.apply(this, arguments);
        this.implements = [];
        this.isAbstract = false;
        this.isFinal = false;
        this.isStatic = false;
        this.properties = [];
        this.methods = [];
        this.constants = [];
        this.traits = [];
    }
    return ClassNode;
}(BaseNode));
exports.ClassNode = ClassNode;
var TraitNode = (function (_super) {
    __extends(TraitNode, _super);
    function TraitNode() {
        _super.apply(this, arguments);
    }
    return TraitNode;
}(ClassNode));
exports.TraitNode = TraitNode;
var InterfaceNode = (function (_super) {
    __extends(InterfaceNode, _super);
    function InterfaceNode() {
        _super.apply(this, arguments);
        this.extends = [];
        this.constants = [];
        this.methods = [];
    }
    return InterfaceNode;
}(BaseNode));
exports.InterfaceNode = InterfaceNode;
var MethodNode = (function (_super) {
    __extends(MethodNode, _super);
    function MethodNode() {
        _super.apply(this, arguments);
        this.params = [];
        this.accessModifier = AccessModifierNode.public;
        this.isStatic = false;
        this.isAbstract = false;
        this.globalVariables = [];
        this.scopeVariables = [];
        this.functionCalls = [];
    }
    return MethodNode;
}(BaseNode));
exports.MethodNode = MethodNode;
var ConstructorNode = (function (_super) {
    __extends(ConstructorNode, _super);
    function ConstructorNode() {
        _super.apply(this, arguments);
        this.isDeprecated = false;
    }
    return ConstructorNode;
}(MethodNode));
exports.ConstructorNode = ConstructorNode;
var FunctionCallNode = (function (_super) {
    __extends(FunctionCallNode, _super);
    function FunctionCallNode() {
        _super.apply(this, arguments);
        this.params = [];
        this.parents = [];
    }
    return FunctionCallNode;
}(BaseNode));
exports.FunctionCallNode = FunctionCallNode;
var VariableNode = (function (_super) {
    __extends(VariableNode, _super);
    function VariableNode() {
        _super.apply(this, arguments);
    }
    return VariableNode;
}(BaseNode));
exports.VariableNode = VariableNode;
var ParameterNode = (function (_super) {
    __extends(ParameterNode, _super);
    function ParameterNode() {
        _super.apply(this, arguments);
        this.optional = false;
        this.parents = [];
    }
    return ParameterNode;
}(VariableNode));
exports.ParameterNode = ParameterNode;
var PropertyNode = (function (_super) {
    __extends(PropertyNode, _super);
    function PropertyNode() {
        _super.apply(this, arguments);
        this.isStatic = false;
    }
    return PropertyNode;
}(BaseNode));
exports.PropertyNode = PropertyNode;
var ConstantNode = (function (_super) {
    __extends(ConstantNode, _super);
    function ConstantNode() {
        _super.apply(this, arguments);
    }
    return ConstantNode;
}(BaseNode));
exports.ConstantNode = ConstantNode;
(function (AccessModifierNode) {
    AccessModifierNode[AccessModifierNode["public"] = 0] = "public";
    AccessModifierNode[AccessModifierNode["private"] = 1] = "private";
    AccessModifierNode[AccessModifierNode["protected"] = 2] = "protected";
})(exports.AccessModifierNode || (exports.AccessModifierNode = {}));
var AccessModifierNode = exports.AccessModifierNode;
var PositionInfo = (function () {
    function PositionInfo(line, col, offset) {
        if (line === void 0) { line = 0; }
        if (col === void 0) { col = 0; }
        if (offset === void 0) { offset = 0; }
        this.line = line;
        this.col = col;
        this.offset = offset;
    }
    return PositionInfo;
}());
exports.PositionInfo = PositionInfo;
var SymbolLookupCache = (function () {
    function SymbolLookupCache() {
    }
    return SymbolLookupCache;
}());
exports.SymbolLookupCache = SymbolLookupCache;
var SymbolCache = (function () {
    function SymbolCache() {
    }
    return SymbolCache;
}());
exports.SymbolCache = SymbolCache;
//# sourceMappingURL=treeBuilder.js.map