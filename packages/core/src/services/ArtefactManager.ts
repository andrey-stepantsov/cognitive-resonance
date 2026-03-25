import { createTwoFilesPatch } from 'diff';
import { Materializer } from './Materializer';
import type { IEvent, ArtefactProposalPayload } from 'cr-core-contracts';

export class ArtefactManager {
  private materializer: Materializer;

  constructor(workspaceDir: string, private sessionEvents: IEvent[]) {
    this.materializer = new Materializer(workspaceDir);
  }

  /**
   * Translates incoming full-file contents into minimal unified diff patches
   * based on the current virtual state of the file.
   */
  async proposeDraft(filepath: string, content: string): Promise<ArtefactProposalPayload> {
    const currentContent = await this.materializer.getVirtualFileContent(filepath, this.sessionEvents);
    
    // createPatch uses unified diff format
    const patch = createTwoFilesPatch(
      filepath,
      filepath,
      currentContent,
      content,
      'virtual-state',
      'proposal'
    );

    return {
      path: filepath,
      patch,
      isFullReplacement: false
    };
  }

  /**
   * Handles multiple file proposals at once.
   */
  async proposeDrafts(files: { path: string, content: string }[]): Promise<ArtefactProposalPayload[]> {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    const proposals: ArtefactProposalPayload[] = [];
    for (const file of files) {
      const proposal = await this.proposeDraft(file.path, file.content);
      proposals.push(proposal);
    }
    
    return proposals;
  }
}
