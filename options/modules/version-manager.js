// modules/version-manager.js - Handles version information and GitHub integration
export class VersionManager {
  constructor() {
    // Configure your repository details here
    this.repositoryOwner = 'Palvaran';  // Your GitHub username
    this.repositoryName = 'factcheck';  // Your actual repository name
    
    this.manifestVersion = 'Loading...';
    this.buildDate = 'Loading...';
    this.latestCommit = null;
    this.releaseNotes = [];
  }

  /**
   * Initialize version information from manifest and GitHub
   */
  async initializeVersionInfo() {
    try {
      // Get version from manifest
      await this.loadManifestVersion();
      
      // Fetch GitHub commit info
      await this.fetchLatestCommitInfo();
      
      // Update UI with the loaded information
      this.updateVersionUI();
      
      return {
        version: this.manifestVersion,
        buildDate: this.buildDate,
        commit: this.latestCommit
      };
    } catch (error) {
      console.error('Error initializing version info:', error);
      // Set fallback values if we failed to load
      document.getElementById('version').textContent = `Version: ${this.manifestVersion || 'Unknown'}`;
      document.getElementById('buildDate').textContent = 'Build date: Unknown';
      
      return {
        version: this.manifestVersion || 'Unknown',
        buildDate: 'Unknown',
        commit: null
      };
    }
  }

  /**
   * Load version information from the extension manifest
   */
  async loadManifestVersion() {
    try {
      const manifest = await chrome.runtime.getManifest();
      this.manifestVersion = manifest.version;
      return this.manifestVersion;
    } catch (error) {
      console.error('Error loading manifest version:', error);
      this.manifestVersion = 'Error';
      return 'Error';
    }
  }

  /**
   * Fetch latest commit information from GitHub API
   */
  async fetchLatestCommitInfo() {
    try {
      const apiUrl = `https://api.github.com/repos/${this.repositoryOwner}/${this.repositoryName}/commits?per_page=1`;
      console.log(`Fetching commit info from: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status}`);
      }
      
      const commits = await response.json();
      if (commits.length > 0) {
        this.latestCommit = commits[0];
        const commitDate = new Date(this.latestCommit.commit.author.date);
        this.buildDate = commitDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        return this.latestCommit;
      }
      throw new Error('No commits found');
    } catch (error) {
      console.error('Error fetching GitHub commit info:', error);
      this.buildDate = 'Unknown';
      return null;
    }
  }

  /**
   * Load release notes from GitHub API
   * If no releases found, display recent commits instead
   */
  async loadReleaseNotes() {
    try {
      // First try to get official releases
      const apiUrl = `https://api.github.com/repos/${this.repositoryOwner}/${this.repositoryName}/releases?per_page=5`;
      console.log(`Fetching releases from: ${apiUrl}`);
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status}`);
      }
      
      const releases = await response.json();
      this.releaseNotes = releases;
      
      // If we don't have releases, fetch recent commits instead
      if (releases.length === 0) {
        console.log("No releases found, fetching commits instead");
        await this.loadCommitHistory();
        return [];
      }
      
      // Update the release notes in the UI
      this.updateReleaseNotesUI();
      
      return releases;
    } catch (error) {
      console.error('Error fetching GitHub releases:', error);
      
      // Try to fetch commits as fallback
      try {
        await this.loadCommitHistory();
      } catch (commitError) {
        console.error('Error fetching commits as fallback:', commitError);
        
        // If both attempts fail, display fallback message
        const releaseNotesElement = document.getElementById('releaseNotes');
        if (releaseNotesElement) {
          releaseNotesElement.innerHTML = `
            <div style="margin-bottom: 15px;">
              <strong>Version ${this.manifestVersion}</strong>
              <ul style="margin-top: 5px;">
                <li>Unable to fetch release notes from GitHub</li>
                <li>Check our GitHub repository for the latest updates</li>
              </ul>
            </div>
          `;
        }
      }
      
      return [];
    }
  }

  /**
   * Load recent commit history and display as release notes
   */
  async loadCommitHistory() {
    try {
      const commitsUrl = `https://api.github.com/repos/${this.repositoryOwner}/${this.repositoryName}/commits?per_page=10`;
      console.log(`Fetching commits from: ${commitsUrl}`);
      
      const response = await fetch(commitsUrl);
      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status}`);
      }
      
      const commits = await response.json();
      
      // Update UI with commit history
      this.updateCommitHistoryUI(commits);
      
      return commits;
    } catch (error) {
      console.error('Error fetching commit history:', error);
      throw error;
    }
  }

  /**
   * Update the UI with version and commit information
   */
  updateVersionUI() {
    // Update version and build date
    document.getElementById('version').textContent = `Version: ${this.manifestVersion}`;
    document.getElementById('buildDate').textContent = `Build date: ${this.buildDate}`;
    
    // Update commit link if available
    const commitLink = document.getElementById('commitLink');
    if (commitLink && this.latestCommit) {
      commitLink.href = this.latestCommit.html_url;
      commitLink.textContent = `View commit: ${this.latestCommit.sha.substring(0, 7)}`;
      commitLink.style.display = 'inline';
    }
  }

  /**
   * Update the UI with release notes in a scrollable container
   */
  updateReleaseNotesUI() {
    const releaseNotesElement = document.getElementById('releaseNotes');
    if (!releaseNotesElement) return;
    
    if (this.releaseNotes.length === 0) {
      releaseNotesElement.innerHTML = `
        <div>
          <strong>Version ${this.manifestVersion}</strong>
          <ul style="margin-top: 5px;">
            <li>No release notes available</li>
          </ul>
        </div>
      `;
      return;
    }
    
    // Create a scrollable container
    let notesHtml = '<div style="max-height: 300px; overflow-y: auto; padding-right: 10px;">';
    
    // Process each release
    this.releaseNotes.forEach(release => {
      const releaseDate = new Date(release.published_at);
      const formattedDate = releaseDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      // Convert markdown in release body to simple HTML (basic conversion)
      let body = release.body || 'No release notes provided';
      
      // Very simple markdown list conversion
      body = body.replace(/\r\n/g, '\n');
      body = body.replace(/\n\n/g, '</p><p>');
      body = body.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      body = body.replace(/\*(.*?)\*/g, '<em>$1</em>');
      
      // Convert markdown lists to HTML lists
      let listItems = [];
      let inList = false;
      
      const processedLines = body.split('\n').map(line => {
        const listMatch = line.match(/^[\s]*[-*][\s]+(.*)/);
        
        if (listMatch) {
          if (!inList) {
            inList = true;
            listItems = [];
          }
          listItems.push(listMatch[1]);
          return null; // Will be removed later
        } else if (inList) {
          // End of list
          const list = `<ul style="margin-top: 5px;">${listItems.map(item => `<li>${item}</li>`).join('')}</ul>`;
          inList = false;
          listItems = [];
          return list + (line ? `<p>${line}</p>` : '');
        }
        
        return line ? `<p>${line}</p>` : '';
      }).filter(Boolean).join('');
      
      // Add any remaining list
      const listHtml = inList ? 
        `<ul style="margin-top: 5px;">${listItems.map(item => `<li>${item}</li>`).join('')}</ul>` : '';
      
      notesHtml += `
        <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <strong>${release.name || `Version ${release.tag_name}`} (${formattedDate})</strong>
          <div style="margin-top: 5px;">
            ${processedLines}
            ${listHtml}
          </div>
        </div>
      `;
    });
    
    // Close the scrollable container
    notesHtml += '</div>';
    
    releaseNotesElement.innerHTML = notesHtml;
  }

  /**
   * Display commit history in the release notes area with scrollable container
   */
  updateCommitHistoryUI(commits) {
    const releaseNotesElement = document.getElementById('releaseNotes');
    if (!releaseNotesElement) return;
    
    if (commits.length === 0) {
      releaseNotesElement.innerHTML = `
        <div>
          <strong>Version ${this.manifestVersion}</strong>
          <ul style="margin-top: 5px;">
            <li>No commit history available</li>
          </ul>
        </div>
      `;
      return;
    }
    
    // Start with heading outside the scrollable area
    let notesHtml = '<strong>Recent Changes</strong>';
    
    // Create scrollable container
    notesHtml += '<div style="max-height: 300px; overflow-y: auto; padding-right: 10px; margin-top: 10px;">';
    
    // Process each commit
    commits.forEach(commit => {
      const commitDate = new Date(commit.commit.author.date);
      const formattedDate = commitDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      // Get the commit message
      let message = commit.commit.message;
      
      // Split into title and body if there are line breaks
      const messageParts = message.split('\n\n');
      const title = messageParts[0];
      
      // Format as list item
      notesHtml += `
        <div style="margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
          <div style="font-weight: bold; margin-bottom: 5px;">${formattedDate}</div>
          <div>${title}</div>
          <div style="margin-top: 5px; font-size: 0.9em;">
            <a href="${commit.html_url}" target="_blank">View commit</a>
          </div>
        </div>
      `;
    });
    
    // Close the scrollable container
    notesHtml += '</div>';
    
    releaseNotesElement.innerHTML = notesHtml;
  }

  /**
   * Refresh version information
   */
  async refreshVersionInfo() {
    console.log('Refreshing version information...');
    await this.initializeVersionInfo();
    await this.loadReleaseNotes();
  }
}