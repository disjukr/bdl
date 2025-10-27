const pptxgen = require('/tmp/bdl-pres/node_modules/pptxgenjs');
const html2pptx = require('/Users/jchoi/.claude/skills/pptx/scripts/html2pptx.js');

async function createPresentation() {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'BDL Team';
    pptx.title = 'BDL - Bridge Definition Language';

    // Slide 1: Title
    await html2pptx('slide1-title.html', pptx);

    // Slide 2: RPC와 직렬화
    await html2pptx('slide2-rpc.html', pptx);

    // Slide 2b: 왜 Bridge인가?
    await html2pptx('slide2b-why-bridge.html', pptx);

    // Slide 3: 기존 솔루션들
    await html2pptx('slide3-existing.html', pptx);

    // Slide 4: 기존 솔루션의 문제점
    await html2pptx('slide4-problems.html', pptx);

    // Slide 5: BDL이 개선하는 것
    await html2pptx('slide5-bdl-features.html', pptx);

    // Slide 6: 구조적 타입 시스템
    await html2pptx('slide6-structural-types.html', pptx);

    // Slide 7: 전송계층/직렬화 독립성
    await html2pptx('slide7-agnostic.html', pptx);

    // Slide 8: 현재 제공되는 도구들
    await html2pptx('slide8-tools.html', pptx);

    // Slide 9: MVP 로드맵
    await html2pptx('slide9-mvp.html', pptx);

    // Slide 10: Closing
    await html2pptx('slide10-closing.html', pptx);

    await pptx.writeFile({ fileName: 'BDL-Presentation.pptx' });
    console.log('프레젠테이션이 성공적으로 생성되었습니다: BDL-Presentation.pptx');
}

createPresentation().catch(console.error);
