// utils/inject-readability.js
// This script will be directly injected into pages
// and it will create a global Readability constructor

// Define Readability if it doesn't exist
if (typeof window.Readability === 'undefined') {
    // The full Readability implementation will be injected here
    // We're doing this to ensure it's available in the global scope
    
    window.Readability = function(doc, options) {
      // Implementation copied from Readability.js
      // Paste the complete Readability constructor and prototype here
      
      // In some older versions, people passed a URI as the first argument. Cope:
      if (options && options.documentElement) {
        doc = options;
        options = arguments[2];
      } else if (!doc || !doc.documentElement) {
        throw new Error(
          "First argument to Readability constructor should be a document object."
        );
      }
      options = options || {};
  
      this._doc = doc;
      this._docJSDOMParser = this._doc.firstChild?.__JSDOMParser__;
      this._articleTitle = null;
      this._articleByline = null;
      this._articleDir = null;
      this._articleSiteName = null;
      this._attempts = [];
      this._metadata = {};
  
      // Configurable options
      this._debug = !!options.debug;
      this._maxElemsToParse =
        options.maxElemsToParse || this.DEFAULT_MAX_ELEMS_TO_PARSE;
      this._nbTopCandidates =
        options.nbTopCandidates || this.DEFAULT_N_TOP_CANDIDATES;
      this._charThreshold = options.charThreshold || this.DEFAULT_CHAR_THRESHOLD;
      this._classesToPreserve = this.CLASSES_TO_PRESERVE.concat(
        options.classesToPreserve || []
      );
      this._keepClasses = !!options.keepClasses;
      this._serializer =
        options.serializer ||
        function (el) {
          return el.innerHTML;
        };
      this._disableJSONLD = !!options.disableJSONLD;
      this._allowedVideoRegex = options.allowedVideoRegex || this.REGEXPS.videos;
      this._linkDensityModifier = options.linkDensityModifier || 0;
  
      // Start with all flags set
      this._flags =
        this.FLAG_STRIP_UNLIKELYS |
        this.FLAG_WEIGHT_CLASSES |
        this.FLAG_CLEAN_CONDITIONALLY;
  
      // Control whether log messages are sent to the console
      if (this._debug) {
        let logNode = function (node) {
          if (node.nodeType == node.TEXT_NODE) {
            return `${node.nodeName} ("${node.textContent}")`;
          }
          let attrPairs = Array.from(node.attributes || [], function (attr) {
            return `${attr.name}="${attr.value}"`;
          }).join(" ");
          return `<${node.localName} ${attrPairs}>`;
        };
        this.log = function () {
          if (typeof console !== "undefined") {
            let args = Array.from(arguments, arg => {
              if (arg && arg.nodeType == this.ELEMENT_NODE) {
                return logNode(arg);
              }
              return arg;
            });
            args.unshift("Reader: (Readability)");
            console.log(...args);
          } else if (typeof dump !== "undefined") {
            var msg = Array.prototype.map
              .call(arguments, function (x) {
                return x && x.nodeName ? logNode(x) : x;
              })
              .join(" ");
            dump("Reader: (Readability) " + msg + "\n");
          }
        };
      } else {
        this.log = function () {};
      }
    };
  
    // Copy all properties from the original Readability:
  
    Readability.prototype = {
      // Add all the Readability prototype methods here
      // You can copy them from Readability.js
      
      // Constants
      FLAG_STRIP_UNLIKELYS: 0x1,
      FLAG_WEIGHT_CLASSES: 0x2,
      FLAG_CLEAN_CONDITIONALLY: 0x4,
      
      // Rest of properties and methods...
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
      DEFAULT_MAX_ELEMS_TO_PARSE: 0,
      DEFAULT_N_TOP_CANDIDATES: 5,
      DEFAULT_TAGS_TO_SCORE: "section,h2,h3,h4,h5,h6,p,td,pre".toUpperCase().split(","),
      DEFAULT_CHAR_THRESHOLD: 500,
      
      // Add all other Readability methods here...
      parse: function() {
        // The full implementation from Readability.js
        // This is a placeholder - you should copy the real implementation
        
        // Simple implementation that returns document text if full implementation not available
        return {
          title: document.title || "",
          content: document.body.innerHTML,
          textContent: document.body.textContent,
          length: document.body.textContent.length,
          excerpt: document.body.textContent.substring(0, 200)
        };
      }
      
      // Add all remaining methods
    };
  
    console.log("Global Readability constructor has been created");
  }