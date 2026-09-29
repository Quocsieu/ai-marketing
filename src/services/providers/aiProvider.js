class AIProvider {
  async generate() {
    throw new Error("Provider.generate must be implemented");
  }
}
module.exports = AIProvider;
