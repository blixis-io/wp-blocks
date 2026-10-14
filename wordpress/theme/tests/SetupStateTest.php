<?php
/**
 * Pure setup status tests (BWB-033).
 *
 * @package Blixis\Theme
 */

declare(strict_types=1);

namespace Blixis\Theme\Tests;

use Blixis\Theme\SetupState;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Stands in for WordPress.
}
require_once dirname( __DIR__ ) . '/src/SetupState.php';

/**
 * Validation and entry action transitions without WordPress.
 */
final class SetupStateTest extends TestCase {

	private const NOW = '2026-10-14T10:00:00+00:00';

	/**
	 * Reject corrupt and future data without throwing.
	 *
	 * @return array<string, array{mixed}>
	 */
	public static function invalid_values(): array {
		$valid = SetupState::initial( self::NOW );
		return array(
			'missing'        => array( false ),
			'not an array'   => array( 'garbage' ),
			'future version' => array( array_merge( $valid, array( 'version' => 2 ) ) ),
			'string version' => array( array_merge( $valid, array( 'version' => '1' ) ) ),
			'unknown status' => array( array_merge( $valid, array( 'status' => 'broken' ) ) ),
			'bad date'       => array( array_merge( $valid, array( 'updated_at' => 'yesterday' ) ) ),
			'invalid preset' => array( array_merge( $valid, array( 'preset' => '<script>' ) ) ),
			'unknown field'  => array( array_merge( $valid, array( 'extra' => true ) ) ),
			'missing date'   => array(
				array(
					'version' => 1,
					'status'  => 'not_started',
				),
			),
		);
	}

	/**
	 * Invalid data is never accepted as a status.
	 *
	 * @param mixed $value Corrupt value.
	 */
	#[DataProvider( 'invalid_values' )]
	public function test_rejects_invalid_values( mixed $value ): void {
		$this->assertNull( SetupState::normalize( $value ) );
		$this->assertNull( SetupState::transition( $value, 'start', self::NOW ) );
	}

	/**
	 * Valid status and preset survive normalization.
	 */
	public function test_normalizes_valid_state(): void {
		$state = array_merge( SetupState::initial( self::NOW ), array( 'preset' => 'forest' ) );
		$this->assertSame( $state, SetupState::normalize( $state ) );
	}

	/**
	 * Start is idempotent and dismiss hides an active setup; final statuses cannot be reopened here.
	 */
	public function test_entry_transitions(): void {
		$initial = SetupState::initial( self::NOW );
		$started = SetupState::transition( $initial, 'start', '2026-10-14T11:00:00+00:00' );
		$this->assertNotNull( $started );
		$this->assertSame( 'in_progress', $started['status'] );
		$this->assertSame( $started, SetupState::transition( $started, 'start', self::NOW ) );
		$dismissed = SetupState::transition( $started, 'dismiss', self::NOW );
		$this->assertNotNull( $dismissed );
		$this->assertSame( 'dismissed', $dismissed['status'] );
		$this->assertNull( SetupState::transition( $initial, 'invalid', self::NOW ) );
		$this->assertNull( SetupState::transition( array_merge( $initial, array( 'status' => 'completed' ) ), 'start', self::NOW ) );
		$this->assertNull( SetupState::transition( array_merge( $initial, array( 'status' => 'dismissed' ) ), 'start', self::NOW ) );
	}

	/**
	 * Resume position accepts only a single valid step and cannot influence site status.
	 */
	public function test_user_interface_state_is_separate(): void {
		$this->assertSame( array( 'resume_step' => 3 ), SetupState::normalize_ui( array( 'resume_step' => 3 ) ) );
		$this->assertNull( SetupState::normalize_ui( array( 'resume_step' => '3' ) ) );
		$this->assertNull( SetupState::normalize_ui( array( 'resume_step' => 7 ) ) );
		$this->assertNull(
			SetupState::normalize_ui(
				array(
					'resume_step' => 2,
					'status'      => 'completed',
				)
			)
		);
	}
}
