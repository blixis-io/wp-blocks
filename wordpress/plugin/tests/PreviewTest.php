<?php
/**
 * Preview security and request contract tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Preview\CoreElementPreviewRenderer;
use Blixis\Builder\Preview\PreviewDocument;
use Blixis\Builder\Preview\PreviewOutput;
use Blixis\Builder\Preview\PreviewRenderer;
use Blixis\Builder\Preview\PreviewResult;
use Blixis\Builder\Preview\PreviewSanitizer;
use Blixis\Builder\Preview\StructurePreviewRenderer;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\EnvelopeValidator;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\StreamStore;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/FakeDatabase.php';
require_once __DIR__ . '/FakePostAccess.php';
require_once __DIR__ . '/FakeSiteLocale.php';
require_once __DIR__ . '/FakePreviewRenderer.php';
require_once __DIR__ . '/RestWordPressStubs.php';
require_once __DIR__ . '/RestResponseStub.php';

/** Preview boundary tests. */
final class PreviewTest extends TestCase {
	/** Dangerous HTML is rejected even after entity and whitespace decoding. */
	public function test_sanitizer(): void {
		foreach ( [ '<ScRiPt>alert(1)</ScRiPt>', '<scr&#105;pt>', '<iframe src=x>', '<div onload =x>', '<div o&#110;click=x>', '<a href="java&#x73;cript:alert(1)">', "<a href=\"java\tscript:alert(1)\">", '<a href="vbscript:x">', '<a href="data:text/html,x">', '<img src="data:image/svg+xml,x">', '<div style="color:red">', '<style>x</style>', '<body>x</body>' ] as $html ) {
			$this->assertFalse( PreviewSanitizer::accepts( $html ), $html );
		}
		$this->assertTrue( PreviewSanitizer::accepts( '<div data-blx-id="a">Safe &amp; sound</div>' ) );
		$this->assertTrue( PreviewSanitizer::accepts( '<p>data: onclick= &lt;script&gt;</p>' ) );
		foreach ( [ '<a href=javascript&colon;alert(1)>', '<img src=x onerror=alert(1)>', '<div title=`bad`>', "<div a=\"x\0y\">", '<svg onload=x>', '<svg><script>x</script></svg>', '<svg><foreignObject></foreignObject></svg>', '<svg><path d="M0 0" onload="x"/></svg>', '<svg><path d="M0 0"/>', '<div style="background-image:url(javascript:alert(1))">' ] as $html ) {
			$this->assertFalse( PreviewSanitizer::accepts( $html ), $html );
		}
		foreach ( [ '<div title="data:x">', '<div title="onclick=x">', '<div title="style=x">', '<div title="&lt;script&gt;">' ] as $html ) {
			$this->assertTrue( PreviewSanitizer::accepts( $html ), $html );
		}
		$this->assertTrue( PreviewSanitizer::accepts( '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true"><path d="M12 3 9 9 3 10"/></svg>' ) );
		$this->assertTrue( PreviewSanitizer::accepts( '<span style="background-image:linear-gradient(90deg,#2563eb 0%,#ec4899 100%);-webkit-background-clip:text;background-clip:text;color:transparent">Safe</span>' ) );
		$this->assertTrue( PreviewSanitizer::accepts( '<span style="--blx-headline-index:2">Safe</span>' ) );
	}

	/** Structural output never interpolates hostile attributes or props. */
	public function test_structure_renderer(): void {
		$document = (object) [
			'root' => [
				(object) [
					'id'       => 'safe-1',
					'type'     => 'blixis/heading',
					'children' => [
						(object) [
							'id'       => 'bad" onload="x',
							'type'     => 'x',
							'props'    => (object) [ 'text' => '<script>' ],
							'children' => [],
						],
					],
				],
			],
		];
		$output   = ( new StructurePreviewRenderer() )->render( $document, 'nl_NL', 'dark' );
		$this->assertSame( '<div data-blx-id="safe-1" data-blx-type="blixis/heading"><div data-blx-invalid></div></div>', $output->html );
		$this->assertSame( '', $output->css );
		$node = (object) [
			'id'       => 'last',
			'type'     => 'x',
			'children' => [],
		];
		for ( $i = 0; $i < 1000; ++$i ) {
			$node = (object) [
				'id'       => 'n' . $i,
				'type'     => 'x',
				'children' => [ $node ],
			];
		}
		$this->assertSame( 1001, \substr_count( ( new StructurePreviewRenderer() )->render( (object) [ 'root' => [ $node ] ], 'en_US', 'light' )->html, '<div' ) );
	}

	/** Iterative walk catches caps and malformed child lists. */
	public function test_tree_limits(): void {
		$root = (object) [
			'root' => [
				(object) [
					'id'       => 'a',
					'type'     => 'x',
					'children' => [],
				],
			],
		];
		$this->assertTrue( PreviewDocument::accepts( $root ) );
		$root->root[0]->children[] = (object) [
			'id'       => 'a',
			'type'     => 'x',
			'children' => [],
		];
		$this->assertFalse( PreviewDocument::accepts( $root ) );
		$root->root[0]->children = [
			1 => (object) [
				'id'       => 'b',
				'type'     => 'x',
				'children' => [],
			],
		];
		$this->assertFalse( PreviewDocument::accepts( $root ) );
		$node = (object) [
			'id'       => 'leaf',
			'type'     => 'x',
			'children' => [],
		];
		for ( $i = 0; $i < 32; ++$i ) {
			$node = (object) [
				'id'       => 'n' . $i,
				'type'     => 'x',
				'children' => [ $node ],
			];
		}
		$this->assertFalse( PreviewDocument::accepts( (object) [ 'root' => [ $node ] ] ) );
		$many = [];
		for ( $i = 0; $i < 5001; ++$i ) {
			$many[] = (object) [
				'id'       => 'n' . $i,
				'type'     => 'x',
				'children' => [],
			];
		}
		$this->assertFalse( PreviewDocument::accepts( (object) [ 'root' => $many ] ) );
	}

	/** Request source bypasses storage; working source reads only selected post streams. */
	public function test_sources_and_permissions(): void {
		$db      = new FakeDatabase();
		$access  = new FakePostAccess();
		$streams = new StreamStore( $db );
		$policy  = new PreviewRequest( new DocumentRequest( $streams, $access ), $streams, new EnvelopeValidator(), new StructurePreviewRenderer(), new FakeSiteLocale() );
		$layout  = '{"schemaVersion":1,"layoutRevision":1,"root":[{"id":"a","type":"x","children":[]}]}';
		$db->insert( 5, MetaKeys::LAYOUT, $layout );
		$db->insert( 5, MetaKeys::content( 'nl_NL' ), '{"schemaVersion":1,"contentRevision":1}' );
		$db->insert( 5, MetaKeys::PUBLISHED, '{"schemaVersion":1,"pointerRevision":1}' );
		$db->insert( 5, MetaKeys::snap_layout( 1 ), $layout );
		$request = $policy->preview( 5, '{"locale":"nl_NL","mode":"dark","document":' . $layout . '}', 'application/json' );
		$this->assertSame( 'request', $request->body['source'] );
		$this->assertSame( [], $db->read_keys );
		$working = $policy->preview( 5, '{}', 'application/json' );
		$this->assertSame( 'working', $working->body['source'] );
		$this->assertSame( 'en_US', $working->body['locale'] );
		$this->assertSame( 'light', $working->body['mode'] );
		$this->assertSame( [ MetaKeys::LAYOUT, MetaKeys::content( 'en_US' ) ], $db->read_keys );
		$this->assertSame( [ [ 5, MetaKeys::LAYOUT ], [ 5, MetaKeys::content( 'en_US' ) ] ], $db->read_addresses );
		$access->authenticated = false;
		$this->assertSame( 'blixis_unauthenticated', $policy->preview( 5, '{}', 'application/json' )->error_code );
		$access->authenticated = true;
		foreach ( [ 'can_edit', 'exists', 'opted_in' ] as $property ) {
			$access->$property = false;
			$this->assertSame( 'blixis_forbidden', $policy->preview( 5, '{}', 'application/json' )->error_code );
			$access->$property = true;
		}
	}

	/** Working preview merges the chosen and default content streams. */
	public function test_core_preview_uses_separate_locale_streams(): void {
		$db      = new FakeDatabase();
		$streams = new StreamStore( $db );
		$layout  = '{"schemaVersion":1,"layoutRevision":1,"defaultLocale":"en_US","root":[{"id":"sec","type":"blixis/section","props":{},"children":[{"id":"hed","type":"blixis/heading","props":{"level":2},"children":[]}]}]}';
		$db->insert( 5, MetaKeys::LAYOUT, $layout );
		$db->insert( 5, MetaKeys::content( 'en_US' ), '{"schemaVersion":1,"contentRevision":1,"entries":{"hed":{"values":{"text":"Source"}}}}' );
		$db->insert( 5, MetaKeys::content( 'nl_NL' ), '{"schemaVersion":1,"contentRevision":1,"entries":{"hed":{"values":{"text":""}}}}' );
		$policy = new PreviewRequest( new DocumentRequest( $streams, new FakePostAccess() ), $streams, new EnvelopeValidator(), new CoreElementPreviewRenderer(), new FakeSiteLocale() );
		$result = $policy->preview( 5, '{"locale":"nl_NL"}', 'application/json' );
		$this->assertNull( $result->error_code );
		$this->assertSame( '<section data-blx-id="sec" data-blx-type="blixis/section"><h2 data-blx-id="hed" data-blx-type="blixis/heading">Source</h2></section>', $result->body['html'] );
	}

	/** Validation and output failures have stable, generic codes. */
	public function test_error_codes_and_output_caps(): void {
		$db        = new FakeDatabase();
		$streams   = new StreamStore( $db );
		$documents = new DocumentRequest( $streams, new FakePostAccess() );
		$policy    = new PreviewRequest( $documents, $streams, new EnvelopeValidator(), new StructurePreviewRenderer(), new FakeSiteLocale() );
		foreach ( [ [ '{"locale":"BAD"}', 'blixis_invalid_locale' ], [ '{"locale":null}', 'blixis_invalid_locale' ], [ '{"mode":"auto"}', 'blixis_invalid_mode' ], [ '{"mode":null}', 'blixis_invalid_mode' ], [ '{"document":{"root":[]}}', 'blixis_invalid_document' ], [ '{}', null ] ] as [ $body, $code ] ) {
			$this->assertSame( $code, $policy->preview( 5, $body, 'application/json' )->error_code );
		}
		$this->assertSame( 'blixis_too_large', $policy->preview( 5, \str_repeat( 'x', Envelope::MAX_BYTES + 1 ), 'application/json' )->error_code );
		$this->assertSame( 'blixis_invalid_document', $policy->preview( 5, '{}', 'text/plain' )->error_code );
		foreach ( [ [ \str_repeat( 'x', PreviewResult::MAX_HTML + 1 ), '' ], [ '', \str_repeat( 'x', PreviewResult::MAX_CSS + 1 ) ], [ '<script>x</script>', '' ] ] as [ $html, $css ] ) {
			$bad    = new FakePreviewRenderer( $html, $css );
			$policy = new PreviewRequest( $documents, $streams, new EnvelopeValidator(), $bad, new FakeSiteLocale() );
			$this->assertSame( 'blixis_preview_failed', $policy->preview( 5, '{"document":{"schemaVersion":1,"layoutRevision":1,"root":[]}}', 'application/json' )->error_code );
		}
		$this->assertInstanceOf( StructurePreviewRenderer::class, PreviewController::select_renderer( new \stdClass() ) );
	}

	/** Successful transport responses prohibit caches. */
	public function test_controller_cache_header(): void {
		$streams   = new StreamStore( new FakeDatabase() );
		$documents = new DocumentRequest( $streams, new FakePostAccess() );
		$preview   = new PreviewRequest( $documents, $streams, new EnvelopeValidator(), new StructurePreviewRenderer(), new FakeSiteLocale() );
		$response  = ( new PreviewController( $preview, $documents ) )->post( new \WP_REST_Request( 'POST', 5, '{}' ) );
		$this->assertInstanceOf( \WP_REST_Response::class, $response );
		$this->assertSame( 'private, no-store', $response->headers['Cache-Control'] );
		$error      = new \WP_REST_Response( [ 'code' => 'blixis_forbidden' ], 403 );
		$controller = new PreviewController( $preview, $documents );
		$controller->no_store( $error, null, new \WP_REST_Request( 'POST', 5, '{}' ) );
		$this->assertSame( 'private, no-store', $error->headers['Cache-Control'] );
	}
}
