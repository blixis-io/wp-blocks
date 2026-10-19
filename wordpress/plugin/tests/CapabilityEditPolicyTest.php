<?php
/** Premium feature capability gate tests.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Registry\CapabilityEditPolicy;
use Blixis\Builder\Registry\ElementDefinitionRegistry;
use Blixis\Builder\Registry\FeatureCapabilityGate;
use Blixis\Builder\Rest\DocumentRequest;
use Blixis\Builder\Rest\FakePostAccess;
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

/** Server-side entitlement policy tests. */
final class CapabilityEditPolicyTest extends TestCase {
	/** Creating or changing a paid node requires its server capability. */
	public function test_paid_nodes_require_server_entitlement_for_creation_and_edits(): void {
		$policy = $this->policy( static fn() => false );
		$this->assertFalse( $policy->allows_layout_update( null, $this->layout( [ $this->cart() ] ) ) );

		$before                = $this->layout( [ $this->cart() ] );
		$changed               = $this->cart();
		$changed->props->label = 'Basket';
		$this->assertFalse( $policy->allows_layout_update( $before, $this->layout( [ $changed ] ) ) );

		$licensed = $this->policy( static fn( string $id, int $version ): bool => 'blixis-pro/cart-icon' === $id && 1 === $version );
		$this->assertTrue( $licensed->allows_layout_update( null, $this->layout( [ $this->cart() ] ) ) );
	}

	/** Existing paid data and its deletion remain writable without the extension; unrelated edits also remain possible. */
	public function test_unchanged_paid_data_and_deletion_do_not_block_other_layout_changes(): void {
		$policy = $this->policy( static fn() => false );
		$before = $this->layout( [ $this->cart(), $this->node( 'heading-1', 'blixis/heading' ) ] );
		$after  = $this->layout( [ $this->cart(), $this->node( 'heading-1', 'blixis/heading', [ 'level' => 3 ] ) ] );
		$this->assertTrue( $policy->allows_layout_update( $before, $after ) );
		$this->assertTrue( $policy->allows_layout_update( $before, $this->layout( [ $this->node( 'heading-1', 'blixis/heading' ) ] ) ) );
		$this->assertTrue( $policy->allows_layout_update( $before, $this->layout( [ $this->node( 'heading-2', 'blixis/heading' ), $this->cart(), $this->node( 'heading-1', 'blixis/heading' ) ] ) ) );
	}

	/** Paid localized text is gated on change, while a no-op content write remains allowed. */
	public function test_paid_content_stream_edits_require_capability(): void {
		$policy = $this->policy( static fn() => false );
		$layout = $this->layout( [ $this->cart() ] );
		$before = $this->content( 'Mini cart' );
		$this->assertTrue( $policy->allows_content_update( $layout, $before, $this->content( 'Mini cart' ) ) );
		$this->assertFalse( $policy->allows_content_update( $layout, $before, $this->content( 'Cart' ) ) );
		$this->assertTrue( $policy->allows_content_update( null, $before, $this->content( 'Cart' ) ) );
	}

	/** REST writes reject a new paid node before reaching persistent storage. */
	public function test_rest_write_rejects_unavailable_paid_element(): void {
		$database = new FakeDatabase();
		$request  = new DocumentRequest(
			new StreamStore( $database ),
			new FakePostAccess(),
			null,
			null,
			new FeatureCapabilityGate( static fn(): bool => false )
		);
		$body     = '{"schemaVersion":1,"layoutRevision":1,"root":[{"id":"cart-01","type":"blixis/cart-icon","props":{"elementId":"cart-01"},"styles":{},"children":[]}]}';
		$result   = $request->put( 5, null, '"0"', $body, 'application/json' );
		$this->assertSame( 403, $result->status );
		$this->assertSame( 'blixis_feature_unavailable', $result->error_code );
		$this->assertSame( [], $database->rows( 5, MetaKeys::LAYOUT ) );
	}

	/** Build a policy with the supplied server resolver.
	 *
	 * @param callable(string,int):bool $resolver Entitlement resolver.
	 */
	private function policy( callable $resolver ): CapabilityEditPolicy {
		return new CapabilityEditPolicy(
			ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' ),
			new FeatureCapabilityGate( $resolver )
		);
	}

	/** Return a paid cart element fixture. */
	private function cart(): \stdClass {
		return $this->object(
			[
				'id'       => 'cart-01',
				'type'     => 'blixis/cart-icon',
				'props'    => [ 'label' => 'Cart' ],
				'styles'   => [],
				'children' => [],
			]
		);
	}

	/** Return an element fixture.
	 *
	 * @param string              $id    Element id.
	 * @param string              $type  Element type.
	 * @param array<string,mixed> $props Element props.
	 */
	private function node( string $id, string $type, array $props = [] ): \stdClass {
		return $this->object(
			[
				'id'       => $id,
				'type'     => $type,
				'props'    => $props,
				'styles'   => [],
				'children' => [],
			]
		);
	}

	/** Return a layout fixture.
	 *
	 * @param array<\stdClass> $root Root elements.
	 */
	private function layout( array $root ): \stdClass {
		return $this->object(
			[
				'schemaVersion' => 2,
				'root'          => $root,
			]
		);
	}

	/** Return a localized content fixture.
	 *
	 * @param string $label Localized label.
	 */
	private function content( string $label ): \stdClass {
		return $this->object(
			[
				'schemaVersion' => 1,
				'entries'       => [ 'cart-01' => [ 'values' => [ 'label' => $label ] ] ],
			]
		);
	}

	/** Convert an array fixture to an object tree.
	 *
	 * @param array<string,mixed> $value Fixture data.
	 */
	private function object( array $value ): \stdClass {
		return json_decode( (string) json_encode( $value ), false, 32, JSON_THROW_ON_ERROR );
	}
}
